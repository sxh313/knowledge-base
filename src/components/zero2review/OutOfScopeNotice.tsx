import { Link } from 'react-router-dom';

export default function OutOfScopeNotice({ message }: { message: string }) {
  return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p>{message}</p><div className="mt-2 flex gap-3 text-xs"><Link className="underline" to="/ai">去普通 AI</Link><Link className="underline" to="/agent">去通用 Agent</Link></div></div>;
}
