// Global Connect - Main Application JavaScript
// Phase 1-4 Implementation: WebRTC + AI Translation + Professional Features

class GlobalConnect {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.remoteStreams = new Map();
        this.isAudioMuted = false;
        this.isVideoOff = false;
        this.isChatOpen = false;
        this.isScreenSharing = false;
        this.recognition = null;
        this.currentLanguage = 'en';
        this.currentUsername = '';
        this.currentRoomId = '';
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupSocket();
        await this.setupCamera();
        this.setupSpeechRecognition();
    }

    setupEventListeners() {
        // Lobby controls
        document.getElementById('joinCallBtn').addEventListener('click', () => this.joinCall());
        document.getElementById('usernameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinCall();
        });
        document.getElementById('roomIdInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinCall();
        });

        // Call controls
        document.getElementById('muteBtn').addEventListener('click', () => this.toggleAudio());
        document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());
        document.getElementById('screenBtn').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('chatBtn').addEventListener('click', () => this.toggleChat());
        document.getElementById('endCallBtn').addEventListener('click', () => this.endCall());

        // Chat functionality
        document.getElementById('chatSendBtn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Window events
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('resize', () => this.adjustVideoLayout());
    }

    setupSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('🔗 Connected to signaling server');
        });

        this.socket.on('room-joined', (data) => {
            console.log('🏠 Joined room:', data.roomId);
            this.showCallInterface();
            
            // Load chat history
            data.messages.forEach(msg => this.displayChatMessage(msg));
        });

        this.socket.on('existing-users', (users) => {
            console.log('👥 Existing users:', users);
            users.forEach(user => this.createPeerConnection(user.socketId, true));
        });

        this.socket.on('user-joined', (user) => {
            console.log('👤 User joined:', user.username);
            this.createPeerConnection(user.userId, false);
            this.showNotification(`${user.username} joined the call`);
        });

        this.socket.on('user-left', (user) => {
            console.log('👋 User left:', user.username);
            this.removePeerConnection(user.userId);
            this.showNotification(`${user.username} left the call`);
        });

        // WebRTC signaling
        this.socket.on('offer', async (data) => {
            await this.handleOffer(data.fromUserId, data.offer);
        });

        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data.fromUserId, data.answer);
        });

        this.socket.on('ice-candidate', async (data) => {
            await this.handleIceCandidate(data.fromUserId, data.candidate);
        });

        // Chat and captions
        this.socket.on('chat-message', (message) => {
            this.displayChatMessage(message);
        });

        this.socket.on('caption-data', (data) => {
            this.displayCaption(data);
        });

        // Screen sharing
        this.socket.on('user-started-screen-share', (data) => {
            this.showNotification(`${data.username} started screen sharing`);
        });

        this.socket.on('user-stopped-screen-share', (data) => {
            this.showNotification(`${data.username} stopped screen sharing`);
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.showNotification('Connection lost. Attempting to reconnect...');
        });
    }

    async setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: { echoCancellation: true, noiseSuppression: true }
            });
            
            this.localStream = stream;
            document.getElementById('previewVideo').srcObject = stream;
            
            console.log('📷 Camera initialized');
        } catch (error) {
            console.error('❌ Camera access denied:', error);
            this.showNotification('Camera access is required for video calls');
        }
    }

    setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onresult = (event) => {
                const last = event.results.length - 1;
                const text = event.results[last][0].transcript;
                
                if (event.results[last].isFinal) {
                    this.processSpeechForTranslation(text);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
            };

            console.log('🎤 Speech recognition initialized');
        } else {
            console.warn('⚠️ Speech recognition not supported');
        }
    }

    async joinCall() {
        const username = document.getElementById('usernameInput').value.trim();
        const roomId = document.getElementById('roomIdInput').value.trim() || this.generateRoomId();
        const language = document.getElementById('languageSelect').value;

        if (!username) {
            this.showNotification('Please enter your name');
            return;
        }

        if (!this.localStream) {
            this.showNotification('Camera access is required');
            return;
        }

        this.currentUsername = username;
        this.currentRoomId = roomId;
        this.currentLanguage = language;

        // Show loading state
        this.showLoadingState(true);

        // Join room via socket
        this.socket.emit('join-room', { roomId, username, language });

        // Start speech recognition for captions
        if (this.recognition) {
            this.recognition.start();
        }
    }

    async createPeerConnection(userId, shouldCreateOffer) {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        const peerConnection = new RTCPeerConnection(configuration);
        this.peerConnections.set(userId, peerConnection);

        // Add local stream tracks
        this.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('📡 Received remote stream from:', userId);
            const remoteStream = event.streams[0];
            this.remoteStreams.set(userId, remoteStream);
            this.addVideoElement(userId, remoteStream);
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetUserId: userId,
                    candidate: event.candidate
                });
            }
        };

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log(`Connection state with ${userId}:`, peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                this.handleConnectionFailure(userId);
            }
        };

        // Create offer if this is the initiator
        if (shouldCreateOffer) {
            try {
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                this.socket.emit('offer', {
                    targetUserId: userId,
                    offer: offer
                });
            } catch (error) {
                console.error('Error creating offer:', error);
            }
        }
    }

    async handleOffer(fromUserId, offer) {
        const peerConnection = this.peerConnections.get(fromUserId);
        if (!peerConnection) return;

        try {
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            this.socket.emit('answer', {
                targetUserId: fromUserId,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(fromUserId, answer) {
        const peerConnection = this.peerConnections.get(fromUserId);
        if (!peerConnection) return;

        try {
            await peerConnection.setRemoteDescription(answer);
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    async handleIceCandidate(fromUserId, candidate) {
        const peerConnection = this.peerConnections.get(fromUserId);
        if (!peerConnection) return;

        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    addVideoElement(userId, stream) {
        const videoGrid = document.getElementById('videoGrid');
        
        // Remove existing video if it exists
        const existingVideo = document.getElementById(`video-${userId}`);
        if (existingVideo) {
            existingVideo.remove();
        }

        // Create video container
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = `video-${userId}`;

        // Create video element
        const video = document.createElement('video');
        video.className = 'video-element';
        video.srcObject = stream;
        video.autoplay = true;
        video.playsinline = true;

        // Create overlay with user info
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="user-info glass-dark">
                User ${userId.substring(0, 6)}...
            </div>
        `;

        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        videoGrid.appendChild(videoContainer);

        this.adjustVideoLayout();
    }

    adjustVideoLayout() {
        const videoGrid = document.getElementById('videoGrid');
        const videoCount = videoGrid.children.length;
        
        if (videoCount > 1) {
            videoGrid.classList.add('multi-user');
        } else {
            videoGrid.classList.remove('multi-user');
        }
    }

    // Control functions
    toggleAudio() {
        this.isAudioMuted = !this.isAudioMuted;
        const audioTrack = this.localStream.getAudioTracks()[0];
        
        if (audioTrack) {
            audioTrack.enabled = !this.isAudioMuted;
        }

        const muteBtn = document.getElementById('muteBtn');
        if (this.isAudioMuted) {
            muteBtn.classList.add('muted');
            muteBtn.innerHTML = '🔇';
            muteBtn.title = 'Unmute Microphone';
        } else {
            muteBtn.classList.remove('muted');
            muteBtn.innerHTML = '🎤';
            muteBtn.title = 'Mute Microphone';
        }
    }

    toggleVideo() {
        this.isVideoOff = !this.isVideoOff;
        const videoTrack = this.localStream.getVideoTracks()[0];
        
        if (videoTrack) {
            videoTrack.enabled = !this.isVideoOff;
        }

        const videoBtn = document.getElementById('videoBtn');
        if (this.isVideoOff) {
            videoBtn.classList.add('video-off');
            videoBtn.innerHTML = '📷';
            videoBtn.title = 'Turn On Camera';
        } else {
            videoBtn.classList.remove('video-off');
            videoBtn.innerHTML = '📹';
            videoBtn.title = 'Turn Off Camera';
        }
    }

    async toggleScreenShare() {
        if (!this.isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                // Replace video track in all peer connections
                const videoTrack = screenStream.getVideoTracks()[0];
                
                this.peerConnections.forEach(async (peerConnection) => {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                });

                this.isScreenSharing = true;
                this.socket.emit('start-screen-share');

                const screenBtn = document.getElementById('screenBtn');
                screenBtn.style.background = 'rgba(255, 193, 7, 0.9)';
                screenBtn.innerHTML = '🛑';
                screenBtn.title = 'Stop Screen Share';

                // Handle screen share end
                videoTrack.onended = () => {
                    this.stopScreenShare();
                };

            } catch (error) {
                console.error('Screen share failed:', error);
                this.showNotification('Screen sharing not available');
            }
        } else {
            this.stopScreenShare();
        }
    }

    async stopScreenShare() {
        // Replace screen with camera
        const videoTrack = this.localStream.getVideoTracks()[0];
        
        this.peerConnections.forEach(async (peerConnection) => {
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
        });

        this.isScreenSharing = false;
        this.socket.emit('stop-screen-share');

        const screenBtn = document.getElementById('screenBtn');
        screenBtn.style.background = 'rgba(33, 150, 243, 0.9)';
        screenBtn.innerHTML = '🖥️';
        screenBtn.title = 'Share Screen';
    }

    toggleChat() {
        this.isChatOpen = !this.isChatOpen;
        const chatSidebar = document.getElementById('chatSidebar');
        
        if (this.isChatOpen) {
            chatSidebar.classList.add('open');
        } else {
            chatSidebar.classList.remove('open');
        }
    }

    sendChatMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (message) {
            this.socket.emit('chat-message', { message });
            chatInput.value = '';
        }
    }

    displayChatMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        const timestamp = new Date(messageData.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        messageElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong>${messageData.username}</strong>
                <small style="opacity: 0.7;">${timestamp}</small>
            </div>
            <div>${this.escapeHtml(messageData.message)}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // AI Translation Functions
    async processSpeechForTranslation(text) {
        if (!text.trim()) return;

        // Display original caption
        this.displayLocalCaption(text, false);

        // Send to other users for translation
        this.socket.emit('caption-data', {
            text: text,
            language: this.currentLanguage,
            isTranslated: false
        });

        // Mock translation (Phase 1.3)
        // In production, this would call Google Translate API
        const translatedText = await this.mockTranslate(text, this.currentLanguage);
        
        // Send translated version
        setTimeout(() => {
            this.socket.emit('caption-data', {
                text: translatedText,
                language: this.currentLanguage,
                isTranslated: true
            });
        }, 500);
    }

    async mockTranslate(text, fromLang) {
        // Mock translation for demonstration
        const translations = {
            'en': {
                'hello': '[ES] Hola [FR] Bonjour [DE] Hallo',
                'how are you': '[ES] ¿Cómo estás? [FR] Comment allez-vous? [DE] Wie geht es dir?',
                'good morning': '[ES] Buenos días [FR] Bonjour [DE] Guten Morgen',
                'thank you': '[ES] Gracias [FR] Merci [DE] Danke'
            }
        };

        const lowerText = text.toLowerCase();
        for (const [phrase, translation] of Object.entries(translations[fromLang] || {})) {
            if (lowerText.includes(phrase)) {
                return translation;
            }
        }

        return `[AUTO-TRANSLATED] ${text}`;
    }

    displayCaption(data) {
        const captionContainer = document.getElementById('captionContainer');
        
        // Clear existing captions
        captionContainer.innerHTML = '';

        // Create caption element
        const captionElement = document.createElement('div');
        captionElement.className = `caption-text ${data.isTranslated ? 'caption-translation' : ''}`;
        captionElement.textContent = data.text;

        captionContainer.appendChild(captionElement);

        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (captionElement.parentNode) {
                captionElement.remove();
            }
        }, 5000);
    }

    displayLocalCaption(text, isTranslated) {
        const captionContainer = document.getElementById('captionContainer');
        
        const captionElement = document.createElement('div');
        captionElement.className = `caption-text ${isTranslated ? 'caption-translation' : ''}`;
        captionElement.textContent = text;
        captionElement.style.opacity = '0.8';
        captionElement.style.borderColor = 'rgba(76, 175, 80, 0.5)';

        captionContainer.appendChild(captionElement);

        setTimeout(() => {
            if (captionElement.parentNode) {
                captionElement.remove();
            }
        }, 3000);
    }

    // UI Helper Functions
    showCallInterface() {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('callContainer').style.display = 'block';
        
        // Add local video
        this.addLocalVideo();
    }

    addLocalVideo() {
        const videoGrid = document.getElementById('videoGrid');
        
        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.id = 'local-video';

        const video = document.createElement('video');
        video.className = 'video-element';
        video.srcObject = this.localStream;
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;

        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        overlay.innerHTML = `
            <div class="user-info glass-dark">
                ${this.currentUsername} (You)
            </div>
        `;

        videoContainer.appendChild(video);
        videoContainer.appendChild(overlay);
        videoGrid.appendChild(videoContainer);
    }

    showLoadingState(show) {
        const joinText = document.querySelector('.join-text');
        const loading = document.querySelector('.loading');
        
        if (show) {
            joinText.classList.add('hidden');
            loading.classList.remove('hidden');
        } else {
            joinText.classList.remove('hidden');
            loading.classList.add('hidden');
        }
    }

    showNotification(message) {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            z-index: 10000;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 14px;
            max-width: 300px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    endCall() {
        this.cleanup();
        
        // Return to lobby
        document.getElementById('callContainer').style.display = 'none';
        document.getElementById('lobby').style.display = 'flex';
        
        // Reset form
        document.getElementById('usernameInput').value = '';
        document.getElementById('roomIdInput').value = '';
        
        this.showNotification('Call ended');
    }

    cleanup() {
        // Stop speech recognition
        if (this.recognition) {
            this.recognition.stop();
        }

        // Close peer connections
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        this.remoteStreams.clear();

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

        // Socket cleanup
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Utility functions
    generateRoomId() {
        return Math.random().toString(36).substring(2, 10).toUpperCase();
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    handleConnectionFailure(userId) {
        console.warn(`Connection failed with user ${userId}, attempting reconnection...`);
        this.showNotification('Connection issue detected, reconnecting...');
        
        // Remove and recreate peer connection
        this.removePeerConnection(userId);
        setTimeout(() => {
            this.createPeerConnection(userId, true);
        }, 2000);
    }

    removePeerConnection(userId) {
        const peerConnection = this.peerConnections.get(userId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(userId);
        }

        this.remoteStreams.delete(userId);
        
        const videoElement = document.getElementById(`video-${userId}`);
        if (videoElement) {
            videoElement.remove();
        }

        this.adjustVideoLayout();
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Global Connect initializing...');
    window.globalConnect = new GlobalConnect();
});