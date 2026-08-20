import { useEffect } from 'react';
import { useZero2ReviewStore } from '../stores/zero2ReviewStore';
import { listReviewSessions } from '../lib/zero2review/repository';
import SourceList from '../components/zero2review/SourceList';

export default function Zero2Review() {
  const { state, input, answer, tasks, mastery, setInput, setAnswer, submit, submitAnswer, reset, finishTask, skipTask } = useZero2ReviewStore();
  const restore = useZero2ReviewStore((store) => store.restore);
  useEffect(() => { void listReviewSessions().then((sessions) => { const latest = sessions[0]; if (latest) void restore(latest.id); }); }, [restore]);
  return <div className="content-frame-reading space-y-4">
    <header className="page-hero"><div className="page-hero-copy"><div className="page-kicker">Source-grounded review</div><h1 className="text-xl font-bold">zero2Agent 复习教练</h1><p className="page-subtitle">只使用 zero2Agent 原文；提问不会直接提高掌握度。</p></div></header>
    <div className="card space-y-3"><textarea className="input-field min-h-20 w-full" value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：解释 RAG 和普通检索的区别" /><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={reset}>新会话</button><button className="btn-primary" onClick={() => void submit()}>开始提问</button></div></div>
    {state?.clarification && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{state.clarification}</div>}
    {state?.error && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">{state.error}</div>}
    {state?.response && <article className="card space-y-4 p-5"><div className="whitespace-pre-wrap text-sm leading-7">{state.response.answer}</div><SourceList citations={state.response.citations} /></article>}
    {state?.question && <section className="card space-y-3 p-5"><h2 className="font-semibold">诊断题</h2><p className="text-sm">{state.question.prompt}</p><textarea className="input-field min-h-24 w-full" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="用自己的话回答" /><button className="btn-primary" onClick={() => void submitAnswer()}>提交答案</button></section>}
    {(tasks.length > 0 || mastery.length > 0) && <section className="grid gap-4 md:grid-cols-2">
      <div className="card space-y-2 p-4"><h2 className="font-semibold">今日任务</h2>{tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-2 text-sm"><span>{task.topicId} · {task.estimatedMinutes} 分钟</span><span className="flex gap-1"><button className="btn-ghost text-xs" onClick={() => void skipTask(task.id)}>跳过</button><button className="btn-ghost text-xs" onClick={() => void finishTask(task.id)}>完成</button></span></div>)}</div>
      <div className="card space-y-2 p-4"><h2 className="font-semibold">掌握度概览</h2>{mastery.slice(0, 8).map((item) => <div key={item.topicId} className="flex justify-between text-sm"><span>{item.topicId}</span><span>{item.mastery == null ? '未知' : `${Math.round(item.mastery * 100)}%`}</span></div>)}</div>
    </section>}
  </div>;
}
