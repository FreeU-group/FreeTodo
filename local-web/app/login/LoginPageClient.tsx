"use client";

import { ArrowRight, Loader2, Lock, Smartphone, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/store/auth-store";

type LoginView = "choose" | "phone-login" | "phone-register" | "create-profile";

interface ProfileItem {
	id: string;
	name: string;
	cloud_user_id: string | null;
}

const PHONE_REGEX = /^1[3-9]\d{9}$/;
const CODE_LENGTH = 6;
const COOLDOWN_SECONDS = 60;
const USERNAME_MIN = 2;
const USERNAME_MAX = 20;
const USERNAME_REGEX = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/;
const PASSWORD_MIN = 6;

export default function LoginPageClient() {
	const router = useRouter();
	const { isAuthenticated, login, hydrate, fetchProfile } = useAuthStore();

	const [view, setView] = useState<LoginView>("choose");
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [profileName, setProfileName] = useState("");
	const [codeSent, setCodeSent] = useState(false);
	const [countdown, setCountdown] = useState(0);
	const [loading, setLoading] = useState(false);
	const [sendingCode, setSendingCode] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const codeInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	useEffect(() => {
		if (isAuthenticated) {
			router.replace("/");
		}
	}, [isAuthenticated, router]);

	useEffect(() => {
		if (countdown <= 0) return;
		const timer = setInterval(() => {
			setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
		}, 1000);
		return () => clearInterval(timer);
	}, [countdown]);

	const isPhoneValid = PHONE_REGEX.test(phone);
	const isCodeValid = code.length === CODE_LENGTH && /^\d+$/.test(code);
	const isUsernameValid =
		username.length >= USERNAME_MIN &&
		username.length <= USERNAME_MAX &&
		USERNAME_REGEX.test(username);
	const isPasswordValid = password.length >= PASSWORD_MIN;
	const isConfirmPasswordValid = password === confirmPassword && confirmPassword.length > 0;
	const isProfileNameValid = profileName.trim().length >= 1;

	const resetForm = useCallback(() => {
		setPhone("");
		setCode("");
		setUsername("");
		setPassword("");
		setConfirmPassword("");
		setProfileName("");
		setCodeSent(false);
		setCountdown(0);
		setError(null);
	}, []);

	const handleSendCode = useCallback(
		async (purpose: string) => {
			if (!isPhoneValid || countdown > 0) return;
			setSendingCode(true);
			setError(null);
			try {
				const res = await fetch("/api/v1/auth/send_code", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ phone, purpose }),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => null);
					throw new Error(data?.detail || "发送验证码失败");
				}
				setCodeSent(true);
				setCountdown(COOLDOWN_SECONDS);
				codeInputRef.current?.focus();
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "发送失败，请重试",
				);
			} finally {
				setSendingCode(false);
			}
		},
		[isPhoneValid, countdown, phone],
	);

	const handlePhoneLogin = useCallback(async () => {
		if (!isPhoneValid || !isCodeValid) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/v1/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phone, code }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.detail || "登录失败");
			}
			const data = await res.json();
			login(data.access_token, data.refresh_token, "cloud", data.profile_id);
			fetchProfile();
			router.replace("/");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "登录失败，请重试",
			);
		} finally {
			setLoading(false);
		}
	}, [isPhoneValid, isCodeValid, phone, code, login, fetchProfile, router]);

	const handleRegister = useCallback(async () => {
		if (!isPhoneValid || !isCodeValid || !isUsernameValid || !isPasswordValid || !isConfirmPasswordValid) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/v1/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phone, code, username, password }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.detail || "注册失败");
			}
			const data = await res.json();
			login(data.access_token, data.refresh_token, "cloud", data.profile_id);
			fetchProfile();
			router.replace("/");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "注册失败，请重试",
			);
		} finally {
			setLoading(false);
		}
	}, [isPhoneValid, isCodeValid, isUsernameValid, isPasswordValid, isConfirmPasswordValid, phone, code, username, password, login, fetchProfile, router]);

	const loginWithProfile = useCallback(async (profileId: string) => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/v1/auth/local_login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ profile_id: profileId }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.detail || "登录失败");
			}
			const data = await res.json();
			login(data.access_token, data.refresh_token, "local", profileId);
			fetchProfile();
			router.replace("/");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "登录失败，请重试",
			);
		} finally {
			setLoading(false);
		}
	}, [login, fetchProfile, router]);

	const handleLocalLogin = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const listRes = await fetch("/api/v1/profile/list");
			if (!listRes.ok) throw new Error("获取工作空间列表失败");
			const listData = await listRes.json();
			const standaloneProfiles: ProfileItem[] = (listData.profiles || []).filter(
				(p: ProfileItem) => !p.cloud_user_id,
			);

			if (standaloneProfiles.length === 0) {
				setLoading(false);
				resetForm();
				setView("create-profile");
				return;
			}

			if (standaloneProfiles.length === 1) {
				await loginWithProfile(standaloneProfiles[0].id);
				return;
			}

			await loginWithProfile(standaloneProfiles[0].id);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "登录失败，请重试",
			);
			setLoading(false);
		}
	}, [loginWithProfile, resetForm]);

	const handleCreateProfile = useCallback(async () => {
		if (!isProfileNameValid) return;
		setLoading(true);
		setError(null);
		try {
			const createRes = await fetch("/api/v1/profile/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: profileName.trim() }),
			});
			if (!createRes.ok) {
				const data = await createRes.json().catch(() => null);
				throw new Error(data?.detail || "创建工作空间失败");
			}
			const created = await createRes.json();
			await loginWithProfile(created.id);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "创建失败，请重试",
			);
		} finally {
			setLoading(false);
		}
	}, [isProfileNameValid, profileName, loginWithProfile]);

	if (isAuthenticated) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background" />
		);
	}

	const subtitleMap: Record<LoginView, string> = {
		choose: "选择登录方式开始使用",
		"phone-login": "使用手机号登录",
		"phone-register": "创建新账号",
		"create-profile": "为本地工作空间取个名字",
	};

	const isPhoneView = view === "phone-login" || view === "phone-register";
	const isRegister = view === "phone-register";
	const purpose = isRegister ? "register" : "login";

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="mx-auto w-full max-w-sm space-y-8 px-6">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-bold tracking-tight text-foreground">
						FreeTodo
					</h1>
					<p className="text-sm text-muted-foreground">
						{subtitleMap[view]}
					</p>
				</div>

				{view === "choose" && (
					<div className="space-y-3">
						<Button
							variant="default"
							size="lg"
							className="w-full h-16 justify-start gap-3 px-5 text-left"
							onClick={() => {
								resetForm();
								setView("phone-login");
							}}
							disabled={loading}
						>
							<Smartphone className="h-5 w-5 shrink-0" />
							<div className="flex flex-col">
								<span className="text-sm font-medium">
									手机号登录
								</span>
								<span className="text-xs opacity-80">
									已有账号，使用验证码登录
								</span>
							</div>
							<ArrowRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
						</Button>

						<Button
							variant="default"
							size="lg"
							className="w-full h-16 justify-start gap-3 px-5 text-left"
							onClick={() => {
								resetForm();
								setView("phone-register");
							}}
							disabled={loading}
						>
							<UserPlus className="h-5 w-5 shrink-0" />
							<div className="flex flex-col">
								<span className="text-sm font-medium">
									手机号注册
								</span>
								<span className="text-xs opacity-80">
									新用户注册，设置用户名
								</span>
							</div>
							<ArrowRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />
						</Button>

						<div className="relative py-2">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t" />
							</div>
							<div className="relative flex justify-center text-xs">
								<span className="bg-background px-2 text-muted-foreground">
									或
								</span>
							</div>
						</div>

						<Button
							variant="outline"
							size="lg"
							className="w-full h-16 justify-start gap-3 px-5 text-left"
							onClick={handleLocalLogin}
							disabled={loading}
						>
							{loading ? (
								<Loader2 className="h-5 w-5 shrink-0 animate-spin" />
							) : (
								<Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
							)}
							<div className="flex flex-col">
								<span className="text-sm font-medium">
									{loading ? "正在进入..." : "本地安全模式"}
								</span>
								<span className="text-xs text-muted-foreground">
									离线使用，数据仅存本地，无需注册
								</span>
							</div>
						</Button>
					</div>
				)}

				{view === "create-profile" && (
					<div className="space-y-4">
						<Input
							type="text"
							placeholder="例如：我的笔记本"
							maxLength={30}
							value={profileName}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
								setProfileName(e.target.value);
								setError(null);
							}}
							className="h-12 text-base"
							autoFocus
							onKeyDown={(e: React.KeyboardEvent) => {
								if (e.key === "Enter" && isProfileNameValid) {
									handleCreateProfile();
								}
							}}
						/>

						<Button
							className="w-full h-12 text-base"
							disabled={!isProfileNameValid || loading}
							onClick={handleCreateProfile}
						>
							{loading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{loading ? "正在创建..." : "创建并进入"}
						</Button>

						<div className="flex items-center justify-center text-sm">
							<button
								type="button"
								className="text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => {
									resetForm();
									setView("choose");
								}}
							>
								返回
							</button>
						</div>
					</div>
				)}

				{isPhoneView && (
					<div className="space-y-4">
						{isRegister && (
							<>
								<Input
									type="text"
									placeholder="设置用户名（2-20字符）"
									maxLength={USERNAME_MAX}
									value={username}
									onChange={(
										e: React.ChangeEvent<HTMLInputElement>,
									) => {
										setUsername(e.target.value);
										setError(null);
									}}
									className="h-12 text-base"
									autoFocus
								/>
								<Input
									type="password"
									placeholder={`设置密码（至少${PASSWORD_MIN}位）`}
									value={password}
									onChange={(
										e: React.ChangeEvent<HTMLInputElement>,
									) => {
										setPassword(e.target.value);
										setError(null);
									}}
									className="h-12 text-base"
								/>
								<Input
									type="password"
									placeholder="确认密码"
									value={confirmPassword}
									onChange={(
										e: React.ChangeEvent<HTMLInputElement>,
									) => {
										setConfirmPassword(e.target.value);
										setError(null);
									}}
									className="h-12 text-base"
								/>
							</>
						)}

						<Input
							type="tel"
							placeholder="请输入手机号"
							maxLength={11}
							value={phone}
							onChange={(
								e: React.ChangeEvent<HTMLInputElement>,
							) => {
								setPhone(e.target.value.replace(/\D/g, ""));
								setError(null);
							}}
							className="h-12 text-base"
							autoFocus={!isRegister}
						/>

						<div className="flex gap-2">
							<Input
								ref={codeInputRef}
								type="text"
								inputMode="numeric"
								placeholder="请输入验证码"
								maxLength={6}
								value={code}
								onChange={(
									e: React.ChangeEvent<HTMLInputElement>,
								) => {
									setCode(
										e.target.value.replace(/\D/g, ""),
									);
									setError(null);
								}}
								className="h-12 text-base flex-1"
							/>
							<Button
								variant="outline"
								className="h-12 px-4 whitespace-nowrap"
								disabled={
									!isPhoneValid ||
									countdown > 0 ||
									sendingCode
								}
								onClick={() => handleSendCode(purpose)}
							>
								{sendingCode ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : countdown > 0 ? (
									`${countdown}s`
								) : codeSent ? (
									"重新发送"
								) : (
									"获取验证码"
								)}
							</Button>
						</div>

						<Button
							className="w-full h-12 text-base"
							disabled={
								!isPhoneValid ||
								!isCodeValid ||
								(isRegister && (!isUsernameValid || !isPasswordValid || !isConfirmPasswordValid)) ||
								loading
							}
							onClick={
								isRegister ? handleRegister : handlePhoneLogin
							}
						>
							{loading ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							{loading
								? isRegister
									? "正在注册..."
									: "正在登录..."
								: isRegister
									? "注册"
									: "登录"}
						</Button>

						<div className="flex items-center justify-between text-sm">
							<button
								type="button"
								className="text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => {
									resetForm();
									setView("choose");
								}}
							>
								返回
							</button>
							<button
								type="button"
								className="text-primary hover:text-primary/80 transition-colors"
								onClick={() => {
									setError(null);
									setView(
										isRegister
											? "phone-login"
											: "phone-register",
									);
								}}
							>
								{isRegister
									? "已有账号？去登录"
									: "没有账号？去注册"}
							</button>
						</div>
					</div>
				)}

				{error && (
					<p className="text-center text-sm text-destructive">
						{error}
					</p>
				)}
			</div>
		</div>
	);
}
