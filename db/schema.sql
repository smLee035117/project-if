-- 사용자 테이블
CREATE TABLE users (
    user_no BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_type TINYINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 게스트 세션 테이블
CREATE TABLE guest_sessions (
    token_hash CHAR(64) CHARACTER SET ascii
        COLLATE ascii_bin PRIMARY KEY,

    user_no BIGINT UNSIGNED NOT NULL,

    expires_at DATETIME NOT NULL,

    created_at DATETIME NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_guest_user (user_no),

    FOREIGN KEY (user_no)
        REFERENCES users(user_no)
);