/**
 * ChonAgent.js — Chú Chồn Ní Ơi 🦊
 * - Hiển thị bong bóng cảnh báo khi khách gặp lỗi (MutationObserver)
 * - Chat panel trò chuyện với Gemini qua /api/guest-chat
 * Không sửa đổi rooms.js — hoàn toàn additive.
 */
(function () {
    'use strict';

    // --- Mapping cảnh báo sang ngôn ngữ Chồn ---
    const MESSAGE_MAP = [
        {
            match: /1 đêm|liên hệ.*zalo|zalo.*hỗ trợ|ghép phòng/i,
            fox: "Ní ơi! Trường hợp này Chồn cần hỗ trợ thêm qua Zalo nha 📱\nĐể mình giúp ní tìm phương án phù hợp nhất nhé~"
        },
        {
            match: /ưu tiên.*2 đêm|từ 2 đêm|2 đêm trở lên/i,
            fox: "Ní ơi! Chồn ưu tiên đặt từ 2 đêm trở lên nha 🌙\nNếu chỉ 1 đêm, ní liên hệ Zalo để Chồn kiểm tra giúp nhé~"
        },
        {
            match: /trẻ.*6 tuổi|6 tuổi.*trẻ|dưới 6/i,
            fox: "Ní ơi! Bé dưới 6 tuổi sẽ thích Green Room hơn đó 🌿\nChồn muốn bé được thoải mái nhất mà~"
        },
        {
            match: /vượt quá|tối đa 3|3 khách/i,
            fox: "Ní ơi! Mỗi phòng chỉ chứa tối đa 3 người thôi nha 🦊\nNếu đoàn đông hơn, ní đặt thêm phòng khác nhé~"
        },
        {
            match: /số người lớn|xác nhận số người/i,
            fox: "Ní ơi! Ní chưa cho Chồn biết có bao nhiêu người ở phòng này nha 😊"
        },
    ];

    function getFoxMessage(rawMsg) {
        if (!rawMsg) return null;
        for (const entry of MESSAGE_MAP) {
            if (entry.match.test(rawMsg)) return entry.fox;
        }
        return `Ní ơi! ${rawMsg} 🦊`;
    }

    // --- Chat history cho Gemini ---
    const chatHistory = [];

    // --- Tạo DOM ---
    function createUI() {
        if (document.getElementById('chon-agent-wrap')) return;

        const wrap = document.createElement('div');
        wrap.id = 'chon-agent-wrap';

        // Chat panel
        const panel = document.createElement('div');
        panel.id = 'chon-chat-panel';
        panel.innerHTML = `
            <div id="chon-chat-header">
                <div>
                    <div id="chon-chat-header-title">
                        <span class="chon-header-icon">🦊</span> Chú Chồn
                    </div>
                    <div id="chon-chat-header-subtitle">Tư vấn phòng · Chồn Village</div>
                </div>
                <button id="chon-chat-close" title="Đóng">✕</button>
            </div>
            <div id="chon-chat-log">
                <div class="chon-msg chon-msg-fox">Ní ơi! Chồn đây~ Ní cần tư vấn gì về phòng không?</div>
            </div>
            <div id="chon-chat-input-row">
                <input id="chon-chat-input" type="text" placeholder="Hỏi Chồn nhé..." />
                <button id="chon-chat-send">➤</button>
            </div>
        `;

        // Bubble cảnh báo
        const bubble = document.createElement('div');
        bubble.id = 'chon-bubble';
        bubble.innerHTML = '<span class="chon-label">Chồn nè 🦊</span><span id="chon-bubble-msg"></span>';

        // Fox button
        const btn = document.createElement('div');
        btn.id = 'chon-fox-btn';
        btn.textContent = '🦊';
        btn.title = 'Chat với Chú Chồn';

        wrap.appendChild(panel);
        wrap.appendChild(bubble);
        wrap.appendChild(btn);
        document.body.appendChild(wrap);

        // Click fox btn: ẩn bubble, toggle chat panel
        btn.addEventListener('click', () => {
            ChonAgent.hide();
            const isOpen = panel.classList.contains('chon-panel-open');
            if (isOpen) {
                panel.classList.remove('chon-panel-open');
            } else {
                panel.classList.add('chon-panel-open');
                document.getElementById('chon-chat-input').focus();
            }
        });

        document.getElementById('chon-chat-close').addEventListener('click', () => {
            panel.classList.remove('chon-panel-open');
        });

        document.getElementById('chon-chat-send').addEventListener('click', sendChatMsg);
        document.getElementById('chon-chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMsg();
        });
    }

    // --- Chat với Gemini ---
    async function sendChatMsg() {
        const input = document.getElementById('chon-chat-input');
        const sendBtn = document.getElementById('chon-chat-send');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        sendBtn.disabled = true;

        appendChatMsg(text, 'user');
        chatHistory.push({ role: 'user', content: text });

        const thinking = appendThinkingDots();

        try {
            const res = await fetch('/api/guest-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: chatHistory })
            });
            const data = await res.json();
            thinking.remove();

            const reply = res.ok ? data.reply : `Ối, Chồn bị lỗi rồi ní ơi 😢 (${data.error || 'unknown'})`;
            appendChatMsg(reply, 'fox', true);
            chatHistory.push({ role: 'assistant', content: reply });
        } catch (err) {
            thinking.remove();
            appendChatMsg('Chồn không kết nối được server ní ơi, thử lại nhé~ 😊', 'fox', true);
        } finally {
            sendBtn.disabled = false;
            input.focus();
        }
    }

    function appendChatMsg(text, type, useTypewriter = false) {
        const log = document.getElementById('chon-chat-log');
        if (!log) return null;
        const div = document.createElement('div');
        div.className = `chon-msg chon-msg-${type}`;
        
        if (useTypewriter && type === 'fox') {
            log.appendChild(div);
            let i = 0;
            const speed = 5; 
            // Đảm bảo div trống trước khi gõ
            div.textContent = ""; 
            function typeWriter() {
                if (i < text.length) {
                    div.textContent += text.charAt(i);
                    i++;
                    if (i % 5 === 0) log.scrollTop = log.scrollHeight;
                    setTimeout(typeWriter, speed);
                } else {
                    div.textContent = text; // Gán lại lần cuối cho chắc chắn đầy đủ
                    log.scrollTop = log.scrollHeight;
                }
            }
            typeWriter();
        } else {
            div.textContent = text;
            log.appendChild(div);
            log.scrollTop = log.scrollHeight;
        }
        return div;
    }

    function appendThinkingDots() {
        const log = document.getElementById('chon-chat-log');
        if (!log) return null;
        const div = document.createElement('div');
        div.className = 'chon-msg chon-msg-thinking';
        div.innerHTML = '<span class="chon-dot"></span><span class="chon-dot"></span><span class="chon-dot"></span>';
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    // --- Auto-hide timer ---
    let hideTimer = null;

    // --- Public API ---
    window.ChonAgent = {
        show(rawMsg, autoHideMs = 7000) {
            const foxMsg = getFoxMessage(rawMsg);
            if (!foxMsg) return;

            const bubble = document.getElementById('chon-bubble');
            const msgEl = document.getElementById('chon-bubble-msg');
            const btn = document.getElementById('chon-fox-btn');
            if (!bubble || !msgEl || !btn) return;

            msgEl.textContent = foxMsg;
            bubble.classList.add('chon-visible');

            btn.classList.remove('chon-wiggling', 'chon-alert');
            void btn.offsetWidth;
            btn.classList.add('chon-alert');
            btn.addEventListener('animationend', () => btn.classList.remove('chon-alert'), { once: true });

            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => ChonAgent.hide(), autoHideMs);
        },

        hide() {
            const bubble = document.getElementById('chon-bubble');
            if (bubble) bubble.classList.remove('chon-visible');
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        }
    };

    // --- MutationObserver: theo dõi #modal-booking-warning ---
    function watchModalWarning() {
        const el = document.getElementById('modal-booking-warning');
        if (!el) return;

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    if (el.classList.contains('active')) ChonAgent.show(el.textContent);
                }
                if (m.type === 'characterData' || m.type === 'childList') {
                    const text = el.textContent?.trim();
                    if (text && el.classList.contains('active')) ChonAgent.show(text);
                }
            }
        });

        observer.observe(el, {
            attributes: true,
            attributeFilter: ['class'],
            characterData: true,
            childList: true,
            subtree: true
        });
    }

    // --- MutationObserver: theo dõi #waitlist-booking-warning ---
    function watchWaitlistWarning() {
        const el = document.getElementById('waitlist-booking-warning');
        if (!el) return;

        const observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes' && m.attributeName === 'class') {
                    if (!el.classList.contains('hidden')) ChonAgent.show(el.textContent);
                }
            }
        });

        observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    }

    // --- Init ---
    function init() {
        createUI();
        watchModalWarning();
        watchWaitlistWarning();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
