-- 기존 DB에 action_history 컬럼이 없는 경우 1회 실행
ALTER TABLE user_play_log_v2
ADD COLUMN action_history JSON NULL;