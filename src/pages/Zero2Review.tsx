import { useEffect } from 'react';
import { useZero2ReviewStore } from '../stores/zero2ReviewStore';
import { listReviewSessions } from '../lib/zero2review/repository';
import SourceList from '../components/zero2review/SourceList';

export default function Zero2Review() {
  const { state, input, answer, setInput, setAnswer, submit, submitAnswer, reset } = useZero2ReviewStore();
  const restore = useZero2ReviewStore((store) => store.restore);
  useEffect(() => { void listReviewSessions().then((sessions) => { const latest = sessions[0]; if (latest) void restore(latest.id); }); }, [restore]);
  return <div className="mx-auto max-w-3xl space-y-5">
    <header><h1 className="text-xl font-bold">zero2Agent 复习教练</h1><p className="text-sm text-[var(--color-text-secondary)]">只使用 zero2Agent 原文；提问不会直接提高掌握度。</p></header>
    <div className="card space-y-3 p-4"><textarea className="input-field min-h-24 w-full" value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：解释 RAG 和普通检索的区别" /><div className="flex gap-2"><button className="btn-primary" onClick={() => void submit()}>提问</button><button className="btn-ghost" onClick={reset}>新会话</button></div></div>
    {state?.clarification && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{state.clarification}</div>}
    {state?.error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{state.error}</div>}
    {state?.response && <article className="card space-y-4 p-5"><div className="whitespace-pre-wrap text-sm leading-7">{state.response.answer}</div><SourceList citations={state.response.citations} /></article>}
    {state?.question && <section className="card space-y-3 p-5"><h2 className="font-semibold">诊断题</h2><p className="text-sm">{state.question.prompt}</p><textarea className="input-field min-h-24 w-full" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话回答" /><button className="btn-primary" onClick={() => void submitAnswer()}>提交答案</button></section>}
  </div>;
}
