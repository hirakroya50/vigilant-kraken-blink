# Tech Stack

- You are building a React application.
- Use TypeScript.
- Use React Router. KEEP the routes in src/App.tsx
- Always put source code in the src folder.
- Put pages into src/pages/
- Put components into src/components/
- The main page (default page) is src/pages/Index.tsx
- UPDATE the main page to include the new components. OTHERWISE, the user can NOT see any components!
- ALWAYS try to use the shadcn/ui library.
- Tailwind CSS: always use Tailwind CSS for styling components. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.

Available packages and libraries:

- The lucide-react package is installed for icons.
- You ALREADY have ALL the shadcn/ui components and their dependencies installed. So you don't need to install them again.
- You have ALL the necessary Radix UI components installed.
- Use prebuilt components from the shadcn/ui library after importing them. Note that these files shouldn't be edited, so make new components if you need to change them.

# Product 008 boundaries

- Browser-only burger demo uses validated local storage, demo roles, integer-cent prices and simulated payments; never represent it as production authentication or real revenue.
- Node-only harness source is under `src/harness/`, compiled with `tsconfig.harness.json`, and excluded from browser compilation. Never import it into React or expose privileged configuration through VITE_ variables.
- Product 008 is partially implemented. Consult `docs/product-008/STATUS.md` and `evidence.json`; worker role lifecycles and Stage B are pending. Unit/smoke results are not live SOW passes.
- Full commit SHAs identify candidates; transient Valkey leases never replace GitHub truth. Candidate execution must remain credential-free and separate from trusted gates.
