export function getAskFollowupQuestionDescription(): string {
	return `## ask_followup_question
Description: Ask the user a question to gather additional information needed to complete the task. Use when you need clarification or more details to proceed effectively. You can ask a single question or multiple questions at once using a carousel UI.

Parameters:
- question: (required if not using questions) A clear, specific question addressing the information needed
- follow_up: (optional) A list of 2-4 suggested answers, each in its own <suggest> tag. Suggestions must be complete, actionable answers without placeholders. Optionally include mode attribute to switch modes (code/architect/etc.)
- questions: (optional) A list of multiple questions to ask in sequence as a carousel. Each question has a <question> tag and optional <follow_up> suggestions. Use this when you need to gather several pieces of information at once.

Usage (single question):
<ask_followup_question>
<question>Your question here</question>
<follow_up>
<suggest>First suggestion</suggest>
<suggest mode="code">Action with mode switch</suggest>
</follow_up>
</ask_followup_question>

Usage (multiple questions carousel):
<ask_followup_question>
<questions>
<item>
<question>First question?</question>
<follow_up>
<suggest>Option A</suggest>
<suggest>Option B</suggest>
</follow_up>
</item>
<item>
<question>Second question?</question>
</item>
</questions>
</ask_followup_question>

Example (single):
<ask_followup_question>
<question>What is the path to the frontend-config.json file?</question>
<follow_up>
<suggest>./src/frontend-config.json</suggest>
<suggest>./config/frontend-config.json</suggest>
<suggest>./frontend-config.json</suggest>
</follow_up>
</ask_followup_question>

Example (multiple questions):
<ask_followup_question>
<questions>
<item>
<question>Which framework are you using?</question>
<follow_up>
<suggest>React</suggest>
<suggest>Vue</suggest>
<suggest>Angular</suggest>
</follow_up>
</item>
<item>
<question>Do you want TypeScript support?</question>
<follow_up>
<suggest>Yes</suggest>
<suggest>No</suggest>
</follow_up>
</item>
</questions>
</ask_followup_question>`
}
