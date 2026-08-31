import { NextRequest, NextResponse } from "next/server";
import { EC2Client, DescribeNetworkAclsCommand, CreateNetworkAclEntryCommand } from "@aws-sdk/client-ec2";
import { prisma } from "@/lib/prisma";

const ec2 = new EC2Client({ region: process.env.AWS_REGION || "ap-northeast-2" });
const NACL_ID = process.env.AWS_NACL_ID || "acl-08a84a805b821fff2";

async function getAvailableRuleNumber(naclId: string): Promise<number>{
  const command = new DescribeNetworkAclsCommand({ NetworkAclIds: [naclId] });
  const response = await ec2.send(command);

  const entries = response.NetworkAcls?.[0]?.Entries || [];
  const usedRules = new Set(
    entries.filter((e) => !e.Egress && e.RuleNumber).map((e) => e.RuleNumber!)
  );

  for (let ruleNum = 1000; ruleNum <= 1999; ruleNum++) {
    if (!usedRules.has(ruleNum)) return ruleNum;
  }

  throw new Error("NACL 1000~1999 대역의 자동 차단 규칙 번호가 모두 사용 중입니다.");
}

export async function POST(req: NextRequest){
  try {
    const internalSecret = req.headers.get("x-internal-secret");
    if (internalSecret !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized internal call" }, { status: 403 });
    }

    const { ipAddress, reason, ttlHours = 24 } = await req.json();

    if (!ipAddress) {
      return NextResponse.json({ error: "ipAddress가 필요합니다." }, { status: 400 });
    }

    const ruleNumber = await getAvailableRuleNumber(NACL_ID);

    await ec2.send(new CreateNetworkAclEntryCommand({
      NetworkAclId: NACL_ID,
      RuleNumber: ruleNumber,
      Protocol: "-1",
      RuleAction: "deny",
      Egress: false,
      CidrBlock: `${ipAddress}/32`,
    }));

    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await prisma.blacklist.upsert({
      where: { ipAddress },
      update: { reason: reason || "AWS NACL 자동 차단", ruleNumber, expiresAt },
      create: { ipAddress, reason: reason || "AWS NACL 자동 차단", ruleNumber, expiresAt },
    });

    return NextResponse.json(
      { message: `IP ${ipAddress}가 NACL(규칙 #${ruleNumber})에 차단 등록되었습니다.`, ruleNumber, expiresAt },
      { status: 200 }
    );
  } catch (error) {
    console.error("Block IP Error:", error);
    return NextResponse.json({ error: "NACL IP 차단 등록 실패" }, { status: 500 });
  }
}