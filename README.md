# AI Quiz

A static, browser-based AI vocabulary quiz. 
This website and its code were created with AI assistance. The content is educational and may contain errors. The site is provided “as is,” without warranties.

## Gameplay

- 45 concepts across three playlists, plus a mixed playlist. Each round asks 10 questions sampled from its playlist.
- Mixed rounds always include bias, parameter, transformer, and perceptron, plus six other concepts.
- Question order and answer order change on every run.
- Each answer reveals the correct option, an explanation, and an everyday analogy.
- Correct answers earn 100 points, plus a streak bonus of 25, 50, 75, then 100 points. Maximum: **1,750 points per 10-question run**; longer runs continue at up to 200 points per question.
- Wrong answers reset the streak without subtracting points. There is no timer.
- Personal bests are saved per playlist in this browser's local storage after a completed run. They are not synced or a secure competitive leaderboard.
- Two hidden buttons sit at the left and right edges of the neuron animation above the quiz. The left starts an all-questions run, independent of the selected playlist; the right starts Neuron Run immediately. They are also reachable by keyboard. An all-questions run has a separate personal best for each question-bank size.
- The Perceptron and LLM tabs are coming-soon placeholders. Switching tabs preserves the current quiz.
- The searchable field guide contains all 45 concepts.
- Dark mode follows your device setting until you use the header toggle. Your selected theme is saved in this browser.
- Every completed quiz, including a zero-point run, offers **Neuron Run**, an optional platform game. Pilot a little AI robot across three layers of moving neurons. Use the arrow keys or A/D to move and Space, W, or Up to jump. With touch, hold a direction and tap Jump. With a mouse, move, release the direction, and click Jump to carry that direction through the air.
- Intermediate neurons drift horizontally and vertically and carry the robot while it stands on them. Entry platforms and exit gates stay still. Your furthest neuron is a checkpoint; falling costs a life and returns you to that neuron's current position.
- Landing on a new neuron earns 100 bonus points; reaching a gate earns 250. Floating gold **AI tokens** earn 10 points each, and blue **vectors** earn 25. Every 100 **collectible** points automatically grants one extra life, carrying any remainder toward the next life. You start with three lives, with no cap on earned lives. Landing and gate points do not count toward extra lives; collectible points remain in your score rather than being spent. Pickups stay collected after a fall, so they cannot be farmed at a checkpoint. A replay resets collectibles, points, and lives.
- Bonus points never affect quiz scores or personal bests. Pause at any time; the game also pauses when the browser loses focus or the tab is hidden. Pausing freezes platforms, pickups, and effects. Reduced-motion mode suppresses decorative motion while preserving the moving-platform challenge.

## Customize

Edit `questions.js` for quiz content and `styles.css` for the design. Keep at least ten questions per category, four answer options per question, and a zero-based `correct` index. Category rounds sample ten questions at random. The mixed playlist references four question IDs directly.


