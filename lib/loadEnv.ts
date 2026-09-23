import path from "path";
import dotenv from "dotenv";

const envPath = path.resolve(__dirname, "..", ".env");
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("[ENV] .env 로드 실패:", result.error);
} else {
  console.log("[ENV] .env 로드 성공");
}