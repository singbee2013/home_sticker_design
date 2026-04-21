/**
 * Alibaba Cloud SMS service for phone verification codes.
 * Docs: https://help.aliyun.com/document_detail/101414.html
 *
 * Setup required in Alibaba Cloud console:
 *   1. Enable 短信服务 (SMS Service)
 *   2. Apply for a sign name (签名): e.g. "贴纸设计"
 *   3. Apply for a template (模板): type = 验证码, content e.g. "您的验证码为${code}，5分钟内有效。"
 *   4. Set ALIYUN_SMS_SIGN_NAME and ALIYUN_SMS_TEMPLATE_CODE in .env
 */
import { createHmac } from "crypto";
import { ENV } from "./env";

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function buildSignature(params: Record<string, string>, secret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");

  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(sorted)}`;
  return createHmac("sha1", `${secret}&`).update(stringToSign).digest("base64");
}

export async function sendSmsCode(phone: string, code: string): Promise<void> {
  const { aliyunSmsAccessKeyId, aliyunSmsAccessKeySecret, aliyunSmsSignName, aliyunSmsTemplateCode } = ENV;

  if (!aliyunSmsAccessKeyId || !aliyunSmsAccessKeySecret || !aliyunSmsSignName || !aliyunSmsTemplateCode) {
    throw new Error("阿里云短信服务未配置，请联系管理员");
  }

  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const nonce = Math.random().toString(36).slice(2) + Date.now();

  const params: Record<string, string> = {
    AccessKeyId: aliyunSmsAccessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: "cn-hangzhou",
    SignName: aliyunSmsSignName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: nonce,
    SignatureVersion: "1.0",
    TemplateCode: aliyunSmsTemplateCode,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: timestamp,
    Version: "2017-05-25",
  };

  const signature = buildSignature(params, aliyunSmsAccessKeySecret);
  const query = new URLSearchParams({ ...params, Signature: signature }).toString();
  const url = `https://dysmsapi.aliyuncs.com/?${query}`;

  const res = await fetch(url);
  const data = (await res.json()) as { Code: string; Message: string };

  if (data.Code !== "OK") {
    console.error("[SMS] Send failed:", data);
    throw new Error(`短信发送失败: ${data.Message || data.Code}`);
  }
}

/** Generate a random 6-digit verification code */
export function generateSmsCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
