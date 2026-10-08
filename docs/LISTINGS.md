# Get AutoCDA listed (MCP directories) — runbook

The package is live: `npx -y autocda-verify-mcp`. These steps make it discoverable
where agent builders look. Config files (`server.json`, `smithery.yaml`) are in the
repo already — most of this is a click or a PR from your accounts.

**One-line description (reuse everywhere):**
> SPICE-verified analog circuit design for AI agents — turn a plain-English intent into a real-ngspice-verified, buyable circuit (measured error, netlist, priced BOM, reproducibility stamp). Tools: `verify_circuit`, `parse_prompt`, `compose_circuit`, `list_circuit_types`.

**Links:** npm `https://www.npmjs.com/package/autocda-verify-mcp` · repo
`https://github.com/LochanPS/AutoCDA` · site `https://auto-cda-phi.vercel.app/`.

---

## 1. Official MCP Registry (modelcontextprotocol/registry)
Uses `server.json` (in repo root) + the `mcp-publisher` CLI with GitHub auth.

```bash
# install the publisher (see github.com/modelcontextprotocol/registry for the latest)
npx -y @modelcontextprotocol/publisher login github   # or: mcp-publisher login github
npx -y @modelcontextprotocol/publisher publish         # reads ./server.json
```
The `name` is `io.github.LochanPS/autocda-verify-mcp` (namespace must match your
GitHub owner, which it does). If the CLI name differs, follow the registry README —
the `server.json` is already schema-shaped.

## 2. Smithery (smithery.ai)
`smithery.yaml` is in the repo. Go to **smithery.ai → Add Server / Deploy →
connect the GitHub repo `LochanPS/AutoCDA`**. Smithery reads `smithery.yaml` and
runs `npx -y autocda-verify-mcp`. No config schema (it needs no keys). Publish.

## 3. Glama (glama.ai)
Glama auto-indexes public GitHub repos that expose an MCP server (it reads the
README's MCP section + npm). Make sure the repo is public (it is). Then go to
**glama.ai**, search for the repo, and **claim it** to add the description/logo.

## 4. mcp.so
Go to **mcp.so → Submit** and paste: name `autocda-verify-mcp`, the repo + npm
links, and the one-line description above. (mcp.so also crawls GitHub, so it may
appear on its own; submitting speeds it up.)

## 5. awesome-mcp-servers (PR)
Open a PR to **github.com/punkpeye/awesome-mcp-servers** (the most-starred list).
Add this line under a fitting category (e.g. **🔬 Science & Specialized** or
**🛠️ Developer Tools**), keeping the file's alphabetical order:

```markdown
- [LochanPS/AutoCDA](https://github.com/LochanPS/AutoCDA) 📇 ☁️ - SPICE-verified analog circuit design: turn a plain-English intent into a real-ngspice-verified, buyable circuit (measured error, netlist, priced BOM). `npx -y autocda-verify-mcp`
```
(Legend in that repo: 📇 = TypeScript/JS, ☁️ = cloud/remote-capable. Match whatever
legend the list currently uses.) Also consider a PR to
**github.com/wong2/awesome-mcp-servers**.

---

## After listing
- Post the `npx` one-liner + the playground link on X / r/electronics / Show HN.
- Point the paper (`docs/PAPER.md`) and the "raw-LLM vs verified" figure at the
  same launch so the claim and the proof land together.
