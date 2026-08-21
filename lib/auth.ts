import bcrypt from "bcryptjs";

// 비밀번호 암호화
export async function hashPassword(password: string): Promise<string>{
  return await bcrypt.hash(password, 10);
}

// 비밀번호 검증
export async function verifyPassword(password: string, hashed: string): Promise<boolean>{
  return await bcrypt.compare(password, hashed);
}