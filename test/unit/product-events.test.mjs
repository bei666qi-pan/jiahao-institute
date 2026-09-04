import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeagueInsights, normalizeProductEvent } from '../../server/observability.mjs';

test('增长事件仅接受固定漏斗事件和非内容型属性', () => {
  assert.deepEqual(normalizeProductEvent({
    name: 'assessment_completed',
    properties: {
      mode: 'text',
      source: '基础算法成绩',
      roomType: 'challenge',
      roomCode: 'SECRET',
      rawText: '这段用户原文绝不能入库',
    },
  }), {
    name: 'assessment_completed',
    properties: { mode: 'text', source: '基础算法成绩', roomType: 'challenge' },
  });
});

test('未知增长事件会被拒绝', () => {
  assert.equal(normalizeProductEvent({ name: 'record_everything', properties: {} }), null);
});

test('联赛漏斗事件只保留无内容维度', () => {
  assert.deepEqual(normalizeProductEvent({
    name: 'league_submission_completed',
    properties: { roomType: 'league', character: 'jiahao', roundDay: 2, answer: '不应保存的原句' },
  }), {
    name: 'league_submission_completed',
    properties: { roomType: 'league', character: 'jiahao', roundDay: 2 },
  });
  for (const name of ['league_room_created', 'league_joined', 'league_vote_cast', 'league_reported', 'league_season_started', 'league_invite_shared']) {
    assert.equal(normalizeProductEvent({ name, properties: {} })?.name, name);
  }
});

test('联赛观测按去重玩家计算邀请完成和 D1 D7', () => {
  assert.deepEqual(buildLeagueInsights([
    { event_name: 'challenge_opened', visitors: 100 },
    { event_name: 'league_joined', visitors: 60 },
    { event_name: 'league_submission_completed', visitors: 42 },
    { event_name: 'league_vote_cast', visitors: 21 },
  ], { active_rooms: 12, average_members: 3.5, submissions: 80, reports: 1 }, { eligible_d1: 40, retained_d1: 11, eligible_d7: 25, retained_d7: 2 }), {
    inviteVisitors: 100,
    joinedVisitors: 60,
    submittedVisitors: 42,
    votedVisitors: 21,
    inviteCompletionRate: 42,
    joinSubmissionRate: 70,
    voteRate: 50,
    activeRooms: 12,
    averageMembers: 3.5,
    submissions: 80,
    reports: 1,
    reportRate: 1.3,
    d1Retention: 27.5,
    d7Retention: 8,
  });
});
