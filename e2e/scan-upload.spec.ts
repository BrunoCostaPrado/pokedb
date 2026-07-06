import path from "node:path"
import { expect, test } from "@playwright/test"

const SAMPLE_DIR = path.resolve("data-sample")

test("/scan uploads image and auto-saves", async ({ page }) => {
	await page.goto("/scan")
	await expect(page.locator("h1")).toBeVisible()

	// Set file input directly (it's hidden)
	await page
		.locator('input[type="file"]')
		.setInputFiles(path.join(SAMPLE_DIR, "SSP_252_R_EN_XS.png"))

	// Wait for auto-save result (OCR → PTCG → mutate)
	// "Card saved!" = success, "Camera not available" = OCR server down
	await expect(page.getByText("Card saved!")).toBeVisible({ timeout: 30000 })
})
