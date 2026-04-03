"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { useSetupStore } from "@/lib/store/setup-store";
import { ApiKeyStep } from "./steps/ApiKeyStep";
import { DirectoryScanStep } from "./steps/DirectoryScanStep";
import { NamingStep } from "./steps/NamingStep";
import { PermissionsStep } from "./steps/PermissionsStep";
import { StartupStep } from "./steps/StartupStep";
import { VoiceprintStep } from "./steps/VoiceprintStep";

interface SetupWizardProps {
	onSetupComplete: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
	const t = useTranslations("onboarding");
	const { currentStep, setStep, totalSteps } = useSetupStore();
	const [transitioning, setTransitioning] = useState(false);

	const goTo = useCallback(
		(step: number) => {
			setTransitioning(true);
			setTimeout(() => {
				setStep(step);
				setTransitioning(false);
			}, 200);
		},
		[setStep],
	);

	const next = useCallback(() => goTo(currentStep + 1), [currentStep, goTo]);
	const prev = useCallback(() => goTo(currentStep - 1), [currentStep, goTo]);

	const stepContent = useMemo(() => {
		switch (currentStep) {
			case 0:
				return <StartupStep onComplete={next} />;
			case 1:
				return <ApiKeyStep onNext={next} />;
			case 2:
				return <DirectoryScanStep onNext={next} onBack={prev} />;
			case 3:
				return <NamingStep onNext={next} onBack={prev} />;
			case 4:
				return <VoiceprintStep onNext={next} onBack={prev} />;
			case 5:
				return (
					<PermissionsStep onComplete={onSetupComplete} onBack={prev} />
				);
			default:
				return null;
		}
	}, [currentStep, next, prev, onSetupComplete]);

	const showDots = currentStep > 0;

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
			{/* Background */}
			<div className="absolute inset-0 bg-neutral-950">
				{/* Gradient orbs */}
				<div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary/[0.07] blur-[120px]" />
				<div className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.05] blur-[100px]" />
				{/* Subtle grid */}
				<div
					className="absolute inset-0 opacity-[0.03]"
					style={{
						backgroundImage:
							"linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
						backgroundSize: "60px 60px",
					}}
				/>
			</div>

			{/* Content */}
			<div className="relative z-10 flex flex-col items-center px-6">
				{/* Title — only on step 0 */}
				{currentStep === 0 && (
					<div className="mb-8 text-center">
						<h1 className="mb-1 text-3xl font-bold tracking-tight text-white">
							Free U
						</h1>
						<p className="text-sm text-white/50">
							{t("startupTagline")}
						</p>
					</div>
				)}

				{/* Step container with fade transition */}
				<div
					className={`transition-all duration-200 ${
						transitioning
							? "translate-y-2 opacity-0"
							: "translate-y-0 opacity-100"
					}`}
				>
					{stepContent}
				</div>

				{/* Step indicator dots */}
				{showDots && (
					<div className="mt-8 flex items-center gap-2">
						{Array.from({ length: totalSteps }, (_, step) => step).map((step) => (
							<div
								key={`step-${step}`}
								className={`h-1.5 rounded-full transition-all duration-300 ${
									step === currentStep
										? "w-6 bg-primary"
										: step < currentStep
											? "w-1.5 bg-primary/40"
											: "w-1.5 bg-white/15"
								}`}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
