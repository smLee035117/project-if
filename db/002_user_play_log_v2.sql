CREATE TABLE IF NOT EXISTS user_play_log_v2 (
    play_id VARCHAR(128) PRIMARY KEY,

    user_no BIGINT UNSIGNED NOT NULL,
    scenario_id VARCHAR(100) NOT NULL,
    scenario_version VARCHAR(100) NOT NULL,

    result_state VARCHAR(20) NOT NULL,
    ending_id VARCHAR(100) NOT NULL,

    story_time_minutes DOUBLE NOT NULL,
    play_version INT UNSIGNED NOT NULL,

    finished_at DATETIME(6) NOT NULL,

    CONSTRAINT fk_user_play_log_v2_user
        FOREIGN KEY (user_no)
        REFERENCES users(user_no),

    CONSTRAINT chk_v2_result_state
        CHECK (result_state IN ('CLEARED', 'FAILED')),

    CONSTRAINT chk_v2_story_time
        CHECK (story_time_minutes >= 0),

    CONSTRAINT chk_v2_play_version
        CHECK (play_version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;