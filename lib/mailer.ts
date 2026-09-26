import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "10.2.11.121",
  port: Number(process.env.SMTP_PORT) || 25,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER || "alert",
    pass: process.env.SMTP_PASS || "1234",
  },
  tls: {
    rejectUnauthorized: false,
  },
});

export interface SecurityAlertEmailPayload {
  to: string;
  userId: string;
  ruleId: string;
  ip: string;
  timestamp: string;
}

const UNKNOWN_USER_MARKER = "Unknown (IP-based)";

export async function sendSecurityAlertEmail(payload: SecurityAlertEmailPayload) {
  const { to, userId, ruleId, ip, timestamp } = payload;
  const hasUser = userId && userId !== UNKNOWN_USER_MARKER;

  const subjectTitle = hasUser ? "계정 이상 행위 탐지" : "인프라 공격 탐지";
  const subjectTarget = hasUser ? userId : `IP ${ip}`;
  const userRowLabel = hasUser ? "대상 유저 ID" : "대상 유저";
  const userRowValue = hasUser ? userId : "해당 없음 (계정 미연동 공격)";

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Zero-Watch Security" <alert@zero-watch.com>',
    to,
    subject: `🚨 [Zero-Watch 보안 경고] ${subjectTitle} - ${subjectTarget}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #d9534f; margin-top: 0;">⚠️ Zero-Watch 보안 경고 알림</h2>
        <p style="font-size: 15px; color: #333333;">
          Zero-Watch IDC 보안 모니터링 시스템에서 ${hasUser ? "계정의 이상 행위를" : "인프라 레벨 공격을"} 탐지하여 자동 제어 조치를 적용했습니다.
        </p>
        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #666666; width: 120px;"><strong>${userRowLabel}:</strong></td>
            <td style="padding: 8px 0; color: #111111;">${userRowValue}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666666;"><strong>탐지 룰 ID:</strong></td>
            <td style="padding: 8px 0; color: #d9534f; font-weight: bold;">${ruleId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666666;"><strong>접속 IP:</strong></td>
            <td style="padding: 8px 0; color: #111111;">${ip}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666666;"><strong>발생 시각:</strong></td>
            <td style="padding: 8px 0; color: #111111;">${timestamp}</td>
          </tr>
        </table>
        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;" />
        <p style="font-size: 13px; color: #777777; margin-bottom: 0;">
          본 메일은 Zero-Watch 자동 관제 엔진에 의해 발송된 시스템 메일입니다. 본인이 수행한 작업이 아니라면 즉시 보안 팀에 문의하세요.
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Mailer] 보안 알림 메일 발송 성공 (MessageID: ${info.messageId}) -> ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[SMTP Mailer Error] 메일 발송 실패:", error);
    return { success: false, error };
  }
}