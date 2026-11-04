import { createConnection } from "mysql2/promise";

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`환경변수가 비어 있습니다: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const port = Number(getEnv("DB_PORT"));

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DB_PORT는 1~65535 사이의 정수여야 합니다.");
  }

  const connection = await createConnection({
    host: getEnv("DB_HOST"),
    port,
    user: getEnv("DB_USER"),
    password: getEnv("DB_PASSWORD"),
    database: getEnv("DB_NAME"),
  });

  try {
    const [rows] = await connection.query(
      "SELECT DATABASE() AS db, CURRENT_USER() AS account, 1 AS ok"
    );

    console.table(rows);
    console.log("MySQL 연결 확인 완료");
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    "DB 연결 확인 실패:",
    error instanceof Error ? error.message : "알 수 없는 오류"
  );
  process.exitCode = 1;
});