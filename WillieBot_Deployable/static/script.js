const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');

function appendMessage(text, isUser=false) {
  const msg = document.createElement('div');
  msg.className = 'message ' + (isUser ? 'user' : 'bot');
  msg.innerText = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
  const msg = userInput.value.trim();
  if (!msg) return;
  appendMessage(msg, true);
  userInput.value = '';
  appendMessage('Typing...', false);
  fetch('/chat', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({message: msg})
  })
  .then(r => r.json())
  .then(data => {
    chatBox.lastChild.remove();
    appendMessage(data.reply || 'No response.', false);
  })
  .catch(err => {
    chatBox.lastChild.remove();
    appendMessage('Error: ' + err, false);
  });
}

function clearChat() {
  chatBox.innerHTML = '';
}

function startVoice() {
  const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  rec.lang = 'en-US';
  rec.onresult = e => {
    userInput.value = e.results[0][0].transcript;
    sendMessage();
  };
  rec.start();
}

function readResponse() {
  const last = [...chatBox.querySelectorAll('.message.bot')].pop();
  if (last) {
    const utter = new SpeechSynthesisUtterance(last.innerText);
    window.speechSynthesis.speak(utter);
  }
}
