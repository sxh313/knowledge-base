import { describe, expect, it } from 'vitest';
import { classifyAgentFailure } from './recovery';

describe('classifyAgentFailure', () => {
  it('识别超时并给出可执行建议', () => {
    expect(classifyAgentFailure('请求 timeout')).toMatchObject({ kind: 'timeout', retryLabel: '直接重试' });
  });
  it('识别文档变化和服务错误', () => {
    expect(classifyAgentFailure('目标文档 content hash 已变化').kind).toBe('document_changed');
    expect(classifyAgentFailure('HTTP 503 service unavailable').kind).toBe('service');
  });
});
