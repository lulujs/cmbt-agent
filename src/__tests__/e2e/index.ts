// cmbt-agent_change - new file
import Mocha from "mocha"
import * as path from "path"
import { glob } from "glob"

export async function run(): Promise<void> {
	const mocha = new Mocha({ ui: "tdd", color: true, timeout: 60000 })

	const testsRoot = path.resolve(__dirname)
	const files = await glob("**/**.e2e.spec.js", { cwd: testsRoot })

	files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)))

	return new Promise((resolve, reject) => {
		mocha.run((failures) => {
			if (failures > 0) {
				reject(new Error(`${failures} tests failed.`))
			} else {
				resolve()
			}
		})
	})
}
