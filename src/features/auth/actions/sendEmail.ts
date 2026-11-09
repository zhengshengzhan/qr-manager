import { Resend } from "resend";

import ForgetPasswordTemplate from "@/emails/forgot-password-template";
import SignInTemplate from "@/emails/sign-in-template";

// 懒加载 Resend 客户端：避免在模块导入时（无 RESEND_API_KEY）就实例化导致构建崩溃。
// 仅有真正发送邮件时才要求配置密钥；未配置时抛出清晰错误而非中断整个应用。
let resendClient: Resend | null = null;

const getResend = (): Resend => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY 未配置，邮件发送不可用。如需邮箱验证码登录/找回密码，请配置 RESEND_API_KEY 与 RESEND_SENDER_ADDRESS；使用 GitHub 登录则无需配置。"
    );
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
};

interface SendEmailProps {
  to: string;
  subject: string;
  name: string;
  otp: string;
}

export const sendSignInEmail = async ({
  to,
  subject,
  name,
  otp,
}: SendEmailProps) => {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_SENDER_ADDRESS!,
    to,
    subject,
    react: SignInTemplate({
      name,
      otp,
    }),
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

export const sendForgetPasswordEmail = async ({
  to,
  subject,
  name,
  otp,
}: SendEmailProps) => {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_SENDER_ADDRESS!,
    to,
    subject,
    react: ForgetPasswordTemplate({
      name,
      otp,
    }),
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
