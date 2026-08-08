import { useState, useRef, useEffect } from 'react';
import { useAIStore } from '../stores/aiStore';
import type { ChatMessage } from '../lib/ai/client';
import ReactMarkdown from 'react-markdown';

export default function AIChat() {
  const { isProcessing, error, conversation, setConversation, addMessage, chat: aiChat, streamingContent } = useAIStore();
  const [input, setInput] = useState('');
  const [context, setContext] = useState('');
  const [showContext, setShowContext] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.length === 0) {
      setConversation([
        { role: 'system', content: '你是一个学习助手。我可以帮你：\n1. 根据笔记内容回答问题\n2. 解释复杂概念\n3. 提供学习建议\n4. 讨论你正在学的内容\n\n请告诉我你今天学了什么，或者有什么问题？' },
        { role: 'assistant', content: '👋 你好！我是你的 AI 学习助手。今天学了什么？或者有什么需要我帮忙的？' },
      ]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    setInput('');
    addMessage(userMsg);

    const messages = [...conversation.filter(m => m.role !== 'system'), userMsg];
    if (context) {
      messages.unshift({ role: 'system', content: `以下是用户的笔记上下文：\n---\n${context}\n---\n请基于这些内容回答问题。` });
    }

    try {
      await aiChat(messages, (token) => {
        const current = useAIStore.getState().streamingContent;
        useAIStore.setState({ streamingContent: current + token });
      });

      const finalContent = useAIStore.getState().streamingContent;
      if (finalContent) {
        addMessage({ role: 'assistant', content: finalContent });
        useAIStore.setState({ streamingContent: '' });
      }
    } catch {
      useAIStore.setState({ streamingContent: '' });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h1 className="text-lg font-bold">🧠 AI 助手</h1>
        <button className={`btn-ghost text-xs ${showContext ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
          onClick={() => setShowContext(!showContext)}>
          📄 {showContext ? '隐藏' : '添加'}上下文
        </button>
      </div>

      {showContext && (
        <div className="px-4 py-2 border-b border-[var(--color-border)] bg-indigo-50/50 dark:bg-indigo-900/10">
          <p className="text-xs text-gray-400 mb-1">将笔记内容粘贴到这里，AI 将基于此上下文回答</p>
          <textarea
            className="input-field text-xs h-20 resize-none"
            placeholder="粘贴笔记内容..."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {conversation.filter(m => m.role !== 'system').map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-[var(--color-text)]'
            }`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isProcessing && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-gray-100 dark:bg-gray-800">
              <ReactMarkdown>{streamingContent}</ReactMarkdown>
              <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse ml-1" />
            </div>
          </div>
        )}
        {isProcessing && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-800">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0s'}} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.15s'}} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.3s'}} />
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="text-center text-sm text-red-500 py-2">❌ {error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex gap-2">
          <textarea
            className="input-field flex-1 resize-none h-10 min-h-[40px] max-h-32 text-sm"
            placeholder="输入你的问题... (Shift+Enter 换行)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="btn-primary px-4" onClick={handleSend} disabled={isProcessing || !input.trim()}>
            发送
          </button>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>当前 AI：自动路由至最优模型</span>
          <button className="hover:text-indigo-500" onClick={() => setConversation([{ role: 'assistant', content: '👋 你好！我是你的 AI 学习助手。今天学了什么？' }])}>
            清空对话
          </button>
        </div>
      </div>
    </div>
  );
}