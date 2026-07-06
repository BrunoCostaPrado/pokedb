import { expect, test } from "@playwright/test"

const PAGES = ["/", "/scan"]

test.describe("smoke", () => {
	for (const path of PAGES) {
		test(`${path} loads`, async ({ page }) => {
			const res = await page.goto(path)
			expect(res?.status()).toBe(200)
			await expect(page.locator("h1")).toBeVisible()
		})
	}
})
