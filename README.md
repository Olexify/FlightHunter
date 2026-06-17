Install dependencies in WebStorm terminal

Open the built-in terminal (Alt+F12) and run:

powershell
# Root dependencies (backend)
npm install

# Client dependencies
cd client
npm install
cd ..






Step 4: Set up your .env

powershell
# Copy the example file
copy .env.example .env

Then open .env in WebStorm and fill in your Amadeus keys (or leave blank for mock data — app works without keys).
Step 5: Run the app from WebStorm

Option A — Terminal (simplest):
In the WebStorm terminal (Alt+F12):

powershell
npm run dev

This starts both backend (port 4000) and frontend (port 5173) simultaneously via concurrently.

Option B — WebStorm Run Configurations (recommended for daily use):

    Go to Run → Edit Configurations

    Click + → npm

    Fill in:

        Name: Flight Hunter

        package.json: E:\Projects\FlightHunter\package.json

        Command: run

        Scripts: dev

    Click OK → press the green ▶ Run button

Step 6: Open in browser

After running:

    Frontend (UI): http://localhost:5173

    Backend (API): http://localhost:4000

    Health check: http://localhost:4000/health