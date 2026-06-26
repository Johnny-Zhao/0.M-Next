import { useState, type ReactElement } from "react";

export interface LoginProps {
  readonly onLogin: (actorId: string) => void;
}

export function normalizeActorId(value: string): string {
  return value.trim() || "demo-actor";
}

export function Login({ onLogin }: LoginProps): ReactElement {
  const [actorId, setActorId] = useState("demo-actor");

  return (
    <section className="home-shell login-shell" aria-label="登录">
      <div className="home-hero">
        <strong>M-Next</strong>
        <h1>数据驱动的工程建模平台</h1>
        <p>结构化建模、实时校验与可信溯源统一在同一工作台。</p>
      </div>
      <form
        className="login-form"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(normalizeActorId(actorId));
        }}
      >
        <label>
          账号
          <input
            autoComplete="username"
            onChange={(event) => setActorId(event.currentTarget.value)}
            value={actorId}
          />
        </label>
        <label>
          密码
          <input
            autoComplete="current-password"
            placeholder="TODO(待后端)"
            readOnly
            type="password"
            value=""
          />
        </label>
        <button type="submit">进入项目</button>
        <button disabled type="button">
          SSO / 企业入口 待接入
        </button>
      </form>
    </section>
  );
}
