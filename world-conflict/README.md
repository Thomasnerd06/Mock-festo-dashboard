# World Conflict

An original single-player, real-time grand strategy game in the browser. Inspired by the genre of real-time nation-scale war games, built from scratch with no pay-to-win mechanics: there is no premium currency, no paid speed-ups, and nothing to buy. Every advantage is earned through play.

## How to run

Open `index.html` in any modern browser. No build step, no server, no dependencies.

## How to play

1. Pick one of eight nations. The other seven are run by AI.
2. The game runs on a real-time clock (1 tick = 1 in-game hour). Use the speed controls in the top bar: pause, normal, fast, very fast.
3. Click a province to select it. From the left panel you can construct buildings, recruit units, and move armies.
4. To move units: tick the units you want, press "Move selected units", then click the destination province. Units path automatically and take time to march.
5. Win by controlling 55% of the world's provinces. Lose if your nation is wiped out.

## Systems

- **Economy**: provinces generate money, supplies, oil and manpower every hour. Cities produce double. Industry buildings boost output. Units cost hourly upkeep.
- **Buildings**: Barracks (infantry), Arms Factory (armour, artillery), Airbase (aircraft and air missions), Industry (output boost), Fortress (defensive damage reduction).
- **Units**: Infantry, Motorised Infantry, Armoured, Artillery (bombards adjacent provinces without taking return fire), Fighters and Bombers (fly strike missions within range from an airbase).
- **Research**: a nine-tech tree unlocking unit types and nation-wide bonuses. One project at a time, paid in money and time.
- **Combat**: stacks in the same province fight every hour. Defenders use their defence stat and benefit from terrain and fortresses. A province falls when hostile land units hold it unopposed.
- **Diplomacy**: declare war and negotiate peace. AI nations start their own wars, press advantages, and sue for peace when they are losing.
- **Map**: procedurally generated from a seed. Type the same seed on the start screen to replay the same world.

Save and load uses your browser's local storage.
