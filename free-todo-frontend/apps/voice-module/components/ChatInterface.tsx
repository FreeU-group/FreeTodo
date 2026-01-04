"use client";

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-card/50 border-l border-border">
      <div className="p-4 border-b border-border bg-card/80 backdrop-blur">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          上下文问答助手
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          可以随时提问。如果有录音内容，我会基于最近 10 分钟的转录内容回答；如果没有录音内容，我也可以回答一般性问题。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          const isStreaming = isLoading && isLastMessage && msg.role === 'model';
          
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-muted text-foreground rounded-bl-none'
                }`}
              >
                {msg.role === 'model' ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-p:leading-relaxed prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-0">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold mb-2 mt-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
                        p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="my-2 list-disc pl-5 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="my-2 list-decimal pl-5 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="my-0.5">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        code: ({ children, className }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code className="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                          ) : (
                            <code className="block bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto">{children}</code>
                          );
                        },
                        pre: ({ children }) => <pre className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto my-2">{children}</pre>,
                        blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-3 my-2 italic">{children}</blockquote>,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                    {isStreaming && (
                      <span className="inline-block w-2 h-2 bg-muted-foreground rounded-full ml-1 animate-pulse" />
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-card/50">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问点什么..."
            className="w-full bg-background border border-input text-foreground text-sm rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:hover:text-muted-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;

