import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '../lib/ai/retrieval';
import MarkdownContent, { normalizeAIResponseMarkdown, normalizeMermaidSource } from './MarkdownContent';

const chunks: RetrievedChunk[] = [
  { source: 'personal', sourceId: 'a', chunkId: 'a:1', title: '个人笔记', content: 'A', score: 1 },
  { source: 'web', sourceId: 'https://example.com', chunkId: 'w:1', title: '网页', content: 'W', score: 1, sourceUrl: 'https://example.com' },
];

describe('MarkdownContent citations', () => {
  it('把数字、知识库和网页引用渲染为可点击来源', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownContent, { citationItems: chunks }, '依据 [1]，联网补充 [W1]，知识库来源 [K1]。'),
    );
    expect(html).toContain('class="inline-citation"');
    expect(html).toContain('[1]');
    expect(html).toContain('[W1]');
    expect(html).toContain('[K1]');
  });

  it('修复模型输出中粘连的来源、Mermaid、HTML 空格和 GFM 表格', () => {
    const broken = '> **来源：美团Keeta Agent开发一面 新手答：「就是把 RAG 和 Agent 结合起来吧。」 高手答：传统 RAG 是单轮管线。&#xA0;****`mermaid flowchart LR subgraph trad[传统 RAG] Q --> R end`****| 维度 | 传统 RAG | Agentic RAG | |------|---------|-------------| | 检索次数 | 单次 | 多次迭代 | | 适用场景 | 简单问答 | 多跳推理 | Agentic RAG 的三个关键能力：';
    const normalized = normalizeAIResponseMarkdown(broken);
    expect(normalized).toContain('> **来源：美团Keeta Agent开发一面**');
    expect(normalized).toContain('```mermaid');
    expect(normalized).toContain('|------|---------|-------------|\n| 检索次数');
    expect(normalized).not.toContain('&#xA0;');
    expect(normalized).not.toContain('****');

    const html = renderToStaticMarkup(createElement(MarkdownContent, null, broken));
    expect(html).toContain('<table');
    expect(html).toContain('mermaid-diagram');
  });

  it('拆分粘连的 Mermaid 边并规范中文引号', () => {
    const source = 'flowchart LR subgraph trad[“传统 RAG”] Q1[“Query”] --> R1[“检索”] --> G1[“生成”] end subgraph agentic[“Agentic RAG”] Q2[“Query”] --> A[“Agent 推理”] A -->|”判断需要什么信息”| R2[“检索工具”] R2 -->|”结果不够/不对”| A end';
    const normalized = normalizeMermaidSource(source);
    expect(normalized).toContain('subgraph trad["传统 RAG"]\nQ1["Query"]');
    expect(normalized).toContain('A["Agent 推理"]\nA -->|"判断需要什么信息"| R2["检索工具"]');
    expect(normalized).toContain('R2["检索工具"]\nR2 -->|"结果不够/不对"| A');
  });

  it('将传统 RAG 与 Agentic RAG 对比图改为横向布局', () => {
    const normalized = normalizeMermaidSource('flowchart TB subgraph trad["传统 RAG"] Q["Query"] end subgraph agentic["Agentic RAG"] A["Agent"] end');
    expect(normalized.startsWith('flowchart LR')).toBe(true);
  });

  it('修复模型粘连反引号的内联表格', () => {
    const normalized = normalizeAIResponseMarkdown('说明：`` | 问题类型 | 方案 | 原因 | |---------|------|------| | 非订单类 | RAG 知识 | 文档检索 |');
    expect(normalized).toContain('| 问题类型 | 方案 | 原因 |\n|---------|------|------|');
    expect(normalized).not.toContain('``');
  });

  it('把模型输出的字面量\\n转换为 Mermaid 可解析的换行', () => {
    const normalized = normalizeMermaidSource('flowchart TB A["第一行\\n第二行"] --> B["结果"]');
    expect(normalized).toContain('A["第一行<br/>第二行"]');
  });

  it('清理引用结尾重复出现的裸编号', () => {
    expect(normalizeAIResponseMarkdown('根据任务边界决定执行策略 [1] [2]。2。')).toBe('根据任务边界决定执行策略 [1] [2]。');
    expect(normalizeAIResponseMarkdown('系统包含 2 个阶段。')).toBe('系统包含 2 个阶段。');
  });
});
