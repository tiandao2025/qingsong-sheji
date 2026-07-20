// v2.1 — fix sessionId log
(function() {
  'use strict';

  // ===== 生成/恢复 sessionId =====
  var sessionId = sessionStorage.getItem('qs_chat_session');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('qs_chat_session', sessionId);
  }

  // ===== 构建 DOM =====
  var chatBtn = document.createElement('button');
  chatBtn.className = 'qs-chat-btn';
  chatBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>';

  var chatWindow = document.createElement('div');
  chatWindow.className = 'qs-chat-window';
  chatWindow.innerHTML =
    '<div class="qs-chat-header">' +
      '<div class="qs-chat-header-left">' +
        '<div class="qs-chat-logo"><img src="images/logo.jpg" alt="青松设计" style="width:100%;height:100%;object-fit:contain;border-radius:50%;" /></div>' +
        '<div><div class="qs-chat-title">青松设计 · 智能客服</div><div class="qs-chat-subtitle">7×24h 在线</div></div>' +
      '</div>' +
      '<button class="qs-chat-close" title="关闭">&times;</button>' +
    '</div>' +
    '<div class="qs-chat-messages"></div>' +
    '<div class="qs-chat-input-wrap">' +
      '<input type="text" class="qs-chat-input" placeholder="输入您的问题..." />' +
      '<button class="qs-chat-send" title="发送"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
    '</div>';

  // ===== 插入页面 =====
  document.body.appendChild(chatBtn);
  document.body.appendChild(chatWindow);

  // ===== DOM 引用 =====
  var messagesEl = chatWindow.querySelector('.qs-chat-messages');
  var inputEl = chatWindow.querySelector('.qs-chat-input');
  var sendBtn = chatWindow.querySelector('.qs-chat-send');
  var closeBtn = chatWindow.querySelector('.qs-chat-close');

  var isOpen = false;
  var messageHistory = [];
  var isWaiting = false;

  // ===== 事件绑定 =====
  chatBtn.addEventListener('click', function() {
    openChat();
  });

  closeBtn.addEventListener('click', function() {
    closeChat();
  });

  sendBtn.addEventListener('click', function() {
    sendMessage();
  });

  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function openChat() {
    isOpen = true;
    chatWindow.classList.add('open');
    chatBtn.style.display = 'none';
    inputEl.focus();

    // 首次打开发欢迎语
    if (!messagesEl.children.length) {
      appendAgentMsg('您好！我是青松设计的智能客服小青~ 请问有什么可以帮您的？');
    }
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove('open');
    chatBtn.style.display = 'flex';
  }

  function sendMessage() {
    if (isWaiting) return;
    var text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    appendUserMsg(text);
    messageHistory.push({ role: 'user', content: text });

    // 显示输入中
    isWaiting = true;
    var typingEl = appendTyping();

    // 调用 API
    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messageHistory, sessionId: sessionId }),
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        typingEl.remove();
        var reply = data.reply || '抱歉，我暂时无法回复，请拨打 19907444111 咨询。';
        appendAgentMsg(reply);
        messageHistory.push({ role: 'assistant', content: reply });
      })
      .catch(function() {
        typingEl.remove();
        appendAgentMsg('网络出小差了~ 您可以直接拨打 19907444111 联系我们！');
      })
      .finally(function() {
        isWaiting = false;
      });
  }

  // ===== 消息渲染 =====
  function appendUserMsg(text) {
    var el = document.createElement('div');
    el.className = 'qs-msg qs-msg-user';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollBottom();
  }

  function appendAgentMsg(text) {
    var el = document.createElement('div');
    el.className = 'qs-msg qs-msg-agent';
    el.textContent = text;
    messagesEl.appendChild(el);
    scrollBottom();
  }

  function appendTyping() {
    var el = document.createElement('div');
    el.className = 'qs-msg-typing';
    el.textContent = '小青正在输入...';
    messagesEl.appendChild(el);
    scrollBottom();
    return el;
  }

  function scrollBottom() {
    requestAnimationFrame(function() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

})();
