import type { Config } from "tailwindcss";

const config: Config = {
	darkMode: "class",
	content: [
		"./app/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./lib/**/*.{ts,tsx}",
		"./apps/**/*.{ts,tsx}",
	],
	plugins: [require("@tailwindcss/typography")],
};

export default config;
