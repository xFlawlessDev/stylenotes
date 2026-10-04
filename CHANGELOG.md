# Changelog

All notable changes to StyleNotes are documented in this file. Versions follow Semantic Versioning and are derived from [Conventional Commits](https://www.conventionalcommits.org/).

## [0.1.1](https://github.com/xFlawlessDev/stylenotes/compare/v0.1.0...v0.1.1) (2026-10-04)

### Features

* add local MCP server details and AI assistant integration to README ([f9a56b4](https://github.com/xFlawlessDev/stylenotes/commit/f9a56b4476311fcbcc0c6095a93b26fb95c6670c))
* enhance notification panel with live insights and dynamic updates ([a658fe2](https://github.com/xFlawlessDev/stylenotes/commit/a658fe22021b75e09041f20dca6db129243a11c0))
* implement update notification system and settings panel integration ([bc2bad4](https://github.com/xFlawlessDev/stylenotes/commit/bc2bad44ed5bfc8c76d54690c8bf01319aaa3f7d))

### Bug Fixes

* add data-tauri-drag-region attributes to TitleBar elements for improved drag functionality ([fa6797f](https://github.com/xFlawlessDev/stylenotes/commit/fa6797f0df3b4ee6e4947be33eb4d8ff08cadcf6))
* update macOS build targets and README for Apple silicon compatibility ([326bc30](https://github.com/xFlawlessDev/stylenotes/commit/326bc30a5ee4c6382d68e39d78d1efc7cf1280f8))
* update window reveal function to ensure focus on macOS ([d85de04](https://github.com/xFlawlessDev/stylenotes/commit/d85de045a39ed8224ca00000641be1648f053100))

## 0.1.0 (2026-10-02)

### Features

* add 'backlog' status to task management and update related components ([a4d4dbd](https://github.com/xFlawlessDev/stylenotes/commit/a4d4dbd10cf69b5a5e2391f861143a561df86cbc))
* add appInfo module and update SettingsPanel to display dynamic app information ([b2b6834](https://github.com/xFlawlessDev/stylenotes/commit/b2b6834875553d44a67efdc9c810e9abde8bbcbc))
* add color-scheme support for dark and light modes in layout.css ([c2d71f7](https://github.com/xFlawlessDev/stylenotes/commit/c2d71f77a72a4d8772631f3a5e15bc04ad19b8d7))
* add custom version updaters for Cargo.toml, Cargo.lock, and tauri.conf.json ([39f6e65](https://github.com/xFlawlessDev/stylenotes/commit/39f6e65184f0cd207b0ab6405db20ada8d82565c))
* add file drop zone component for file attachments ([d70e744](https://github.com/xFlawlessDev/stylenotes/commit/d70e744366723a65504f4797a0f6feedc4f545c6))
* add formatTimelineMonthYear function for consistent date formatting in Gantt chart ([6b45b3a](https://github.com/xFlawlessDev/stylenotes/commit/6b45b3afa84f5397f389a6f32412f92d8ff9ade0))
* add fullscreen support for Mermaid diagrams with interactive viewer ([2f411e2](https://github.com/xFlawlessDev/stylenotes/commit/2f411e22a2f005feee945168ab1ff7a68653e1e9))
* add GanttTaskLabelCell and GanttTaskTooltip components for enhanced task display and interaction ([a0eff82](https://github.com/xFlawlessDev/stylenotes/commit/a0eff82dcef1863c2cd06dd1c336cb9f5b2977c2))
* add i18n with English and Indonesian, plus a language setting ([6e718f5](https://github.com/xFlawlessDev/stylenotes/commit/6e718f5be4674719c5d4065f1c75b14620986342))
* add ImportMarkdownDialog component for markdown file import functionality ([8c504e3](https://github.com/xFlawlessDev/stylenotes/commit/8c504e32a9be44d0d265002a7dc51f6ed7cf6822))
* add initial design draft for UI Extensions, separating extension and theme concepts, and outlining architecture and use cases ([f5e55dd](https://github.com/xFlawlessDev/stylenotes/commit/f5e55dd9bc5d1ee8babb4fe83879d7f11396b2fd))
* add initial mobile app design document outlining architecture and decisions ([ae7cb77](https://github.com/xFlawlessDev/stylenotes/commit/ae7cb7743e1cdc50ff414a4ef0250ecb2c479002))
* add journal feature with CRUD operations and UI integration ([d6705ed](https://github.com/xFlawlessDev/stylenotes/commit/d6705ed0c2f169fda70c18cb3a157e0a3b8d977b))
* add Kanban window with drag-and-drop task management ([5bd07ca](https://github.com/xFlawlessDev/stylenotes/commit/5bd07cadb2155b66f288e3a60e1401cfd8e805e7))
* add language labels to code blocks and update styles ([48c3678](https://github.com/xFlawlessDev/stylenotes/commit/48c3678db35bc5e8c1ca3b17359a16a3032f14d6))
* add MCP scenario driver script for realistic workspace testing ([9a31db8](https://github.com/xFlawlessDev/stylenotes/commit/9a31db864a85d5ed8e581dac88bbe46c3252b6b7))
* add overlay support for notes and tasks with quick capture functionality ([2fbbea8](https://github.com/xFlawlessDev/stylenotes/commit/2fbbea8211bd2419d4342e033a0453c3c171ff68))
* add reasoning and tool trace functionality to AI chat ([e274cf6](https://github.com/xFlawlessDev/stylenotes/commit/e274cf6604089ceb7ff7830f179052543746cca4))
* add revealCurrentWindow function and update page mount logic to show current window ([2280936](https://github.com/xFlawlessDev/stylenotes/commit/22809368e12e32f8850ee231621a80f6368a0810))
* add Shiki syntax highlighting support and implement dock cursor tracking ([27ba7d3](https://github.com/xFlawlessDev/stylenotes/commit/27ba7d33b8be06507b687f6e2be8637910a7babf))
* add skill validation script and tests ([f60eb2b](https://github.com/xFlawlessDev/stylenotes/commit/f60eb2b459931259383d9fe5d2c1f5d46ef7a9ee))
* add stylenotes-mcp Agent Skill for external agents ([1d63ebc](https://github.com/xFlawlessDev/stylenotes/commit/1d63ebc65fbe72ea4270fe19b12d3e82587dbb09))
* add technical design document for auto-save hardening and note/task versioning ([1e75ecb](https://github.com/xFlawlessDev/stylenotes/commit/1e75ecbca4f46cae51a9c8885d6e2a3e0eec704e))
* add Three.js skills for animation, fundamentals, geometry, and materials ([0d6750e](https://github.com/xFlawlessDev/stylenotes/commit/0d6750e42ab16fffd928ffdb772ee73ab30b8f78))
* add timezone settings and current time handling for AI assistant ([392a717](https://github.com/xFlawlessDev/stylenotes/commit/392a717158873eebcadf23aae85d5a0aebbee875))
* add various application icons and launcher assets for Android and iOS ([5c5157a](https://github.com/xFlawlessDev/stylenotes/commit/5c5157acada40513467e899c4b78b56bc34eaf87))
* add wiki link autocomplete feature with popover support ([1584688](https://github.com/xFlawlessDev/stylenotes/commit/1584688ec106496597911eb8ffdac9139bd234a9))
* add wiki link functionality and enhance tag management in notes ([332c524](https://github.com/xFlawlessDev/stylenotes/commit/332c524b2ac275f5d4a9fea6968f31baea36c189))
* add workspace component with note management features ([88f8c91](https://github.com/xFlawlessDev/stylenotes/commit/88f8c91a691595b13e9d6c8ac6043eb066670634))
* AI assistant with BYOK providers, global chat and MCP tools ([a8bbc6a](https://github.com/xFlawlessDev/stylenotes/commit/a8bbc6a5b4e412c47348ff0f340ed6d7a17e1ecb))
* **attachments:** recoverable delete with Trash and guaranteed history ([8fb70d3](https://github.com/xFlawlessDev/stylenotes/commit/8fb70d31d7364b0a43007e9a950d31a65c1ac6fd)), references [A11-#A16](https://github.com/xFlawlessDev/stylenotes/issues/A16)
* **citations:** implement citation popover for inline markers and enhance citation handling in chat ([b26b417](https://github.com/xFlawlessDev/stylenotes/commit/b26b4179a1dee34edc31545dc12ef7590a0c4545))
* **citations:** implement inline citation markers and source display in AI responses ([e0f9ffa](https://github.com/xFlawlessDev/stylenotes/commit/e0f9ffa0eb1a0e16dd2ee9bad58b7dea6beaedde))
* **dashboard:** add TaskDashboard component and update task views ([fcce567](https://github.com/xFlawlessDev/stylenotes/commit/fcce567bf764e91bb0f9a888658800c5ac75b36d))
* **db:** add repositories for meta, notes, notifications, settings, and tasks ([73b9482](https://github.com/xFlawlessDev/stylenotes/commit/73b9482cf53858d7cc5c929e182a62eb2c75535e))
* disable default drag-and-drop for images and links, and customize text selection highlight ([1f42488](https://github.com/xFlawlessDev/stylenotes/commit/1f42488d9eff9398911c22d5cbfd180f6ae2c338))
* **dock:** implement dock task button and settings for dock position ([991021f](https://github.com/xFlawlessDev/stylenotes/commit/991021f5e0b6aa81514c6405a330b056e74026a2))
* **editor:** find in note with Ctrl/Cmd+F ([6702cf0](https://github.com/xFlawlessDev/stylenotes/commit/6702cf046ae39fb4324d1a8635d22ee48a0c84ed))
* **editor:** show skeleton while the note preview renders ([8508c2c](https://github.com/xFlawlessDev/stylenotes/commit/8508c2c58d913adf13b36d7de5270a656ed5e46f))
* **editor:** show thin themed scrollbars on note surfaces ([2ed7341](https://github.com/xFlawlessDev/stylenotes/commit/2ed7341b4455c482214f373c13b398ae00479aad))
* **embed:** enhance model management and serialization for local embeddings ([061892d](https://github.com/xFlawlessDev/stylenotes/commit/061892d7f5bcf3582d94fe882d9d5604c58fa783))
* enhance AiComposer and AiChatPanel with improved styling and copy message functionality ([54c6c15](https://github.com/xFlawlessDev/stylenotes/commit/54c6c150cd96ae34f6300e9c302055a93e2d99ff))
* enhance dock visibility handling and cursor tracking for improved user experience ([ad340ad](https://github.com/xFlawlessDev/stylenotes/commit/ad340adfdeef6dab2a595001292209a43e3537e9))
* enhance graph theming with dynamic color tokens and palette refresh functionality ([2dd9787](https://github.com/xFlawlessDev/stylenotes/commit/2dd9787a2d6aa92afd8c1c5fe16a1da01ba74f49))
* enhance markdown rendering with KaTeX and task lists support ([7667677](https://github.com/xFlawlessDev/stylenotes/commit/7667677d3bb4a34ff09a2d756838fdc00bf80ca6))
* enhance note export functionality with folder support and improve markdown file naming ([8e2800c](https://github.com/xFlawlessDev/stylenotes/commit/8e2800c817cc145cdb6b8efc5896f1b86d1daf9b))
* enhance note management and settings functionality ([47ef6f4](https://github.com/xFlawlessDev/stylenotes/commit/47ef6f4644b6823a7963570ac4ee52d678f76670))
* enhance ONNX model management and memory autonomy ([7f52c57](https://github.com/xFlawlessDev/stylenotes/commit/7f52c573e2c7760413d304b9edbd243581a1cf66))
* enhance search functionality with new tools and ranking system ([48fd6d2](https://github.com/xFlawlessDev/stylenotes/commit/48fd6d296fce2495fc8b33d1f1e0f0325eb40846))
* enhance task management with dependency handling in Gantt chart ([29fc9d3](https://github.com/xFlawlessDev/stylenotes/commit/29fc9d36160e2fbcf0711647c9b97dd44f48bea8))
* enhance TaskGantt with timeline scaling and new header component ([d306e21](https://github.com/xFlawlessDev/stylenotes/commit/d306e215fb5dcce78f98b529da7c941253967f5f))
* enhance text selection styling for improved contrast and accessibility ([c1a85cf](https://github.com/xFlawlessDev/stylenotes/commit/c1a85cf68a89cff0a206351d599a9ea31f1241c0))
* enhance vertical drag functionality with click detection and state change options ([6712e1e](https://github.com/xFlawlessDev/stylenotes/commit/6712e1ea6bd7fefe09e78e657aae405b26ea07f5))
* enhance wiki link functionality and workspace graph ([0f961fe](https://github.com/xFlawlessDev/stylenotes/commit/0f961fe8a58c8d369c0f6d92680d361f4193c00d))
* enhance workspace management and task handling ([cc91b4d](https://github.com/xFlawlessDev/stylenotes/commit/cc91b4df9bc890ad421372bc47c9800ed1363f59))
* **graph:** enhance camera focus handling and add resetView functionality ([c229d95](https://github.com/xFlawlessDev/stylenotes/commit/c229d95d68b42dde8538076b3c429f0fd27a9fa4))
* **graph:** enhance edge and node handling with new legends and colors ([eedb4d4](https://github.com/xFlawlessDev/stylenotes/commit/eedb4d4c000d996cbf15552bf1b551197d92b1ac))
* **graph:** enhance graph visualization and interaction ([9135edb](https://github.com/xFlawlessDev/stylenotes/commit/9135edb8e36667bdc6dd5be44bc5f9abd9dd3d9a))
* **graph:** implement 3D graph layout and scene rendering ([fb923c9](https://github.com/xFlawlessDev/stylenotes/commit/fb923c9353a7720fed54f007848c31aecd2baa05))
* **graph:** update search shortcut to Ctrl/Cmd+F for graph search functionality ([2708ad6](https://github.com/xFlawlessDev/stylenotes/commit/2708ad6769934036c5b18eaf03cf3d4cacc42aae))
* implement attachment management system ([31a2ed7](https://github.com/xFlawlessDev/stylenotes/commit/31a2ed7e88aa8d928ac1056a41946055baaa9767))
* implement context menu components and integrate with NoteContextMenu ([f21cd92](https://github.com/xFlawlessDev/stylenotes/commit/f21cd92b79fe7e63955874bb56f6effdc496d667))
* implement editNoteBodyAction for in-place note editing ([deab408](https://github.com/xFlawlessDev/stylenotes/commit/deab408e8e3528d34dd7d58de61f57e4d02ffe44))
* implement external link handling to open in default browser ([ed703a0](https://github.com/xFlawlessDev/stylenotes/commit/ed703a033817206a1f86ea43e559c98d820ff1a0))
* implement inline editing for preview blocks and enhance styling ([c513cc0](https://github.com/xFlawlessDev/stylenotes/commit/c513cc04ab1f5e4fb273285b6ef21b6c47109faa))
* implement MCP server and database schema ([bb99df6](https://github.com/xFlawlessDev/stylenotes/commit/bb99df69228bf7499073232597d441433cd74100))
* implement push-based job handling with filesystem watcher for MCP ([1dffad0](https://github.com/xFlawlessDev/stylenotes/commit/1dffad0747d27a72885f3898e450fa0354d1c2f5))
* implement table of contents functionality with syncing and preview navigation ([f22569a](https://github.com/xFlawlessDev/stylenotes/commit/f22569aaa4f4171d08d0c9c5a7907845cc45c05c))
* implement task-note linking functionality with database support and UI updates ([daa2dad](https://github.com/xFlawlessDev/stylenotes/commit/daa2dad1febf5e4633ed1307881f2ec42585f28e))
* implement tooltip component and integrate across workspace components ([2530040](https://github.com/xFlawlessDev/stylenotes/commit/2530040379b184ce04493475577aaa359fe5a964))
* implement UI plugin system with CSS generation and storage ([0cddef1](https://github.com/xFlawlessDev/stylenotes/commit/0cddef17468b8de60549198cab396477b49e335f))
* implement web search and fetch tools with settings persistence ([e79e395](https://github.com/xFlawlessDev/stylenotes/commit/e79e395515517c5ccec8ffbac32f997368517cc3))
* implement WorkspaceShell and related components for workspace management ([fc706b9](https://github.com/xFlawlessDev/stylenotes/commit/fc706b97408067a1b473411eaea937da6ace1213))
* improve dock window click-through handling with promise chaining ([50a1a0e](https://github.com/xFlawlessDev/stylenotes/commit/50a1a0ea0560ec78fd4d29bf6fc0bd70b8ade627))
* improve scrolling behavior and layout adjustments in VaultRail component ([a9b1ae0](https://github.com/xFlawlessDev/stylenotes/commit/a9b1ae0d1424229a0f6af46c740df60736b437d7))
* initialize Tauri + SvelteKit + TypeScript application with UI components ([9144b14](https://github.com/xFlawlessDev/stylenotes/commit/9144b147189f5d233265865b6f5347cfb2c6126b))
* integrate Mermaid for diagram rendering in notes ([9bbf459](https://github.com/xFlawlessDev/stylenotes/commit/9bbf459ebed2a45d43024087b4f652aa31172f07))
* Introduce memory nudges and enhance snapshot handling ([d74dcf8](https://github.com/xFlawlessDev/stylenotes/commit/d74dcf83a0ac85aeedee60866425e08deb6a94d7))
* local MCP server (stdio) with AI & MCP settings ([f0899c3](https://github.com/xFlawlessDev/stylenotes/commit/f0899c3cdbd2397223dfeeb02c9fb5225da9a1f8)), references [#D1](https://github.com/xFlawlessDev/stylenotes/issues/D1) [#D2](https://github.com/xFlawlessDev/stylenotes/issues/D2) [#D5](https://github.com/xFlawlessDev/stylenotes/issues/D5) [#D11](https://github.com/xFlawlessDev/stylenotes/issues/D11) [#D3](https://github.com/xFlawlessDev/stylenotes/issues/D3) [#D12](https://github.com/xFlawlessDev/stylenotes/issues/D12) [#D14](https://github.com/xFlawlessDev/stylenotes/issues/D14) [#D4](https://github.com/xFlawlessDev/stylenotes/issues/D4) [#D13](https://github.com/xFlawlessDev/stylenotes/issues/D13) [#13a](https://github.com/xFlawlessDev/stylenotes/issues/13a) [#13b](https://github.com/xFlawlessDev/stylenotes/issues/13b) [#D8](https://github.com/xFlawlessDev/stylenotes/issues/D8) [#D10](https://github.com/xFlawlessDev/stylenotes/issues/D10)
* make wiki links in AI chat replies clickable ([eb88a55](https://github.com/xFlawlessDev/stylenotes/commit/eb88a5502cef4f26cf42cfb9b73df40ebb3c4571))
* **mcp-sidecar:** implement placeholder seeding to resolve chicken-and-egg build issue ([1d208bc](https://github.com/xFlawlessDev/stylenotes/commit/1d208bc3fa97cb58ca3a1a54dfd1436cbca6076c))
* **memory:** add a force re-index option ([8ac8868](https://github.com/xFlawlessDev/stylenotes/commit/8ac88687fa6344d4413af6b7fa3546eb9414c921)), references [#D6](https://github.com/xFlawlessDev/stylenotes/issues/D6)
* **mermaid:** enhance SVG rendering by polyfilling measurements and adjusting initialization settings ([a6d1474](https://github.com/xFlawlessDev/stylenotes/commit/a6d1474d614ad147d5a9d8b9f5ab49fe87710316))
* **note-editor:** add folder selection for moving notes in NoteEditor ([841c30c](https://github.com/xFlawlessDev/stylenotes/commit/841c30cc8c6b63151a62c6d7a769fc909c035b1f))
* **notes:** add workspace support to listNotes and loadFolders functions ([53a930d](https://github.com/xFlawlessDev/stylenotes/commit/53a930d437cefe6469eda9820974df5e42a6e61c))
* **onnx-runtime:** implement ONNX Runtime setup and resource management ([7e4126f](https://github.com/xFlawlessDev/stylenotes/commit/7e4126f274ab0b4f869b6d3433fc7b5c7df43a5e))
* persist notes, folders, settings, and notifications in SQLite ([34aeb90](https://github.com/xFlawlessDev/stylenotes/commit/34aeb90871e41ea61ab8820e9c10e8fab304ff61))
* **quit:** enhance quit handling to ensure all windows flush pending writes before exit ([408af77](https://github.com/xFlawlessDev/stylenotes/commit/408af77c1ebb30aa9eb13135c2a839001bcec873))
* **readme:** update client configuration instructions and add remote config template ([fef60fd](https://github.com/xFlawlessDev/stylenotes/commit/fef60fd67ea8af0a7b18e403140f3568839c4629))
* refactor rail components for improved layout and scrolling behavior ([2b60469](https://github.com/xFlawlessDev/stylenotes/commit/2b604690c33de6208bb607ce786ef8bc0e4f064d))
* **remote-mcp:** enhance listener management and add URL copy functionality ([431b91b](https://github.com/xFlawlessDev/stylenotes/commit/431b91bf0aee78a8b8dac3655792cc70bfa29c0d))
* **remote-mcp:** implement listener restoration and decryption for stored tokens ([bfcebd5](https://github.com/xFlawlessDev/stylenotes/commit/bfcebd533393c5bb8a8eebfc2cf2e97ec6b38d4e))
* **remote-mcp:** implement persistent token storage and enhance remote listener functionality ([7213a70](https://github.com/xFlawlessDev/stylenotes/commit/7213a70205b8c0864fa5d299f7173cc1a4336dfe))
* replace PencilLine icon with application logo in VaultRail and update TitleBar image class ([a505ca9](https://github.com/xFlawlessDev/stylenotes/commit/a505ca9d86934588be16bae2e14c6bd8da0417b1))
* **segmented-control:** add labelClass prop for customizable label visibility ([c050a8a](https://github.com/xFlawlessDev/stylenotes/commit/c050a8a9ed2d608a89ac50eed2625901b9c430df))
* semantic memory, graph intelligence, remote MCP and markdown import ([33ad729](https://github.com/xFlawlessDev/stylenotes/commit/33ad729c6e865ceec182e2b4415876d23c1c42b7))
* **shared:** initialize shared package with sync contract and DTOs ([f52f7f6](https://github.com/xFlawlessDev/stylenotes/commit/f52f7f6448595cc28f0530ec05acef0528f0d1ca))
* simplify EditorStatus component by removing unused Check icon and adjusting word count display ([127f245](https://github.com/xFlawlessDev/stylenotes/commit/127f24520c5786ae5409e814672603833da81afc))
* **TaskBoard:** add countBase for improved task filtering logic ([9af7cdb](https://github.com/xFlawlessDev/stylenotes/commit/9af7cdbf51a70b36f91e7d53e4da7db419cb275a))
* **TaskRail:** enhance task filtering by integrating countBase and updating status handling ([493b0d9](https://github.com/xFlawlessDev/stylenotes/commit/493b0d9acf301927fbb53342b57f0304c7be26da))
* **taste:** add preferences for task UI and responsiveness ([bbdda5b](https://github.com/xFlawlessDev/stylenotes/commit/bbdda5b94240f9aa05eb7e6150079094eb21144d))
* **taste:** update dependency evaluation criteria and enhance markdown preview layout ([399037d](https://github.com/xFlawlessDev/stylenotes/commit/399037dbb8ac0877ace6fb341580c2d9b34718ff))
* **ui:** add a shared component base for buttons and form controls ([5f86480](https://github.com/xFlawlessDev/stylenotes/commit/5f86480ebbfedcbb7769163d81f21632d7a454c6))
* **ui:** add select, dropdown menu, and separator primitives ([e1a3ca4](https://github.com/xFlawlessDev/stylenotes/commit/e1a3ca43e390631c001efe6afcd38c33896d8a10))
* **ui:** add stable data-ui hooks and custom CSS examples ([9db2995](https://github.com/xFlawlessDev/stylenotes/commit/9db2995436e00841e9e623e15ec193375179bb9e))
* update attachment path handling to use app-data root instead of attachments directory ([9b29c9b](https://github.com/xFlawlessDev/stylenotes/commit/9b29c9baa02e31fd5167259c2f3e58f4a3406f41))
* update button variants and accessibility attributes in NoteToolbar ([b954a90](https://github.com/xFlawlessDev/stylenotes/commit/b954a90a3e3f22181af3557115db91df7b5ac659))
* update note timestamps to use relative time format and add tests for updated label ([af25d84](https://github.com/xFlawlessDev/stylenotes/commit/af25d847d7243ef82e23bead919dd15d9a87a566))
* update package identifiers and database paths to reflect new naming convention ([55d73d4](https://github.com/xFlawlessDev/stylenotes/commit/55d73d4a6d821271333e007762b1cfe4f5541e4d))
* update VaultRail component to include NotebookPen icon and adjust header text ([855698b](https://github.com/xFlawlessDev/stylenotes/commit/855698b2a10f93e4d0e16a614d2620b7fc90acae))
* **vault:** add poll-based two-way sync and read-only folder mode ([29f2420](https://github.com/xFlawlessDev/stylenotes/commit/29f2420266495d941e18f3830da6b1165c541ee7)), references [#V21](https://github.com/xFlawlessDev/stylenotes/issues/V21)
* **vault:** add vault folder mirror (export + folder import) ([78c991c](https://github.com/xFlawlessDev/stylenotes/commit/78c991cc9c22351fe2745421767181a33bbb203d)), references [#V1-V22](https://github.com/xFlawlessDev/stylenotes/issues/V1-V22)
* **vault:** react to folder changes with a recursive watcher ([ccc1b93](https://github.com/xFlawlessDev/stylenotes/commit/ccc1b93e5236ad9dc5aac7cae42a514c9aa38535)), references [#V19](https://github.com/xFlawlessDev/stylenotes/issues/V19)
* **vault:** resolve two-way conflicts with the user ([f43370e](https://github.com/xFlawlessDev/stylenotes/commit/f43370e03f8bbd6105553e036eab96810a1a4b70))
* **versioning:** implement note and task versioning system ([86782d7](https://github.com/xFlawlessDev/stylenotes/commit/86782d76346d06865b033197b45aaa83fa2793d3))
* **workspace:** implement workspace management features ([53b752a](https://github.com/xFlawlessDev/stylenotes/commit/53b752a3a1eb1b8f521a400c5594b61d7f0b1aff))

### Bug Fixes

* adjust max height for folder and tag navigation to improve layout consistency ([0a8ffe7](https://github.com/xFlawlessDev/stylenotes/commit/0a8ffe7c7886aaad79a123a4e3d01f2d4c0d5a91))
* **attachments:** hide trashed blobs and add manager filter, search, and trash dialog ([8e8b5fd](https://github.com/xFlawlessDev/stylenotes/commit/8e8b5fd1fba736930e106223a877cb6c6c364e36))
* **CommandPalette:** improve scrolling behavior for active items in the command palette ([efed64f](https://github.com/xFlawlessDev/stylenotes/commit/efed64f821d69908b3e0ca93dce74d725d712dac))
* **note-window:** keep header fixed and restore preview scrolling ([95feb13](https://github.com/xFlawlessDev/stylenotes/commit/95feb13b056b5e1cb4a8f9a2e94fc7460290cc4c))
* send tool_call_id in camelCase so follow-up tool turns are valid ([5218f00](https://github.com/xFlawlessDev/stylenotes/commit/5218f000abbb48362367cc101b09a8becda9ffed))
* **tests:** remove unused tick import and improve dialog teardown timing ([9e47bbd](https://github.com/xFlawlessDev/stylenotes/commit/9e47bbd13309d8637bf2391f4a5b4ffba33e9c75))
* **ui:** adjust button width in TitleBar for better responsiveness ([a052b1e](https://github.com/xFlawlessDev/stylenotes/commit/a052b1edcb49abf524867001570a65306515ab7e))
* update Search component styles for improved visibility in TaskRail and NotesFeed ([49e263e](https://github.com/xFlawlessDev/stylenotes/commit/49e263eb5adbe1920ead7fe01a9e599abc165866))
* update secondary and ring color variables for improved contrast in light mode ([2c6b1ea](https://github.com/xFlawlessDev/stylenotes/commit/2c6b1eaa8ae3986ccc834e5c4c68a7f73bf3a1db))

# Changelog

All notable changes to StyleNotes are documented in this file. Versions follow Semantic Versioning and are derived from [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- **Open core foundation.** The desktop app is explicitly OSS (AGPL-3.0) with a
  separate, proprietary cloud. One desktop build ships; it is cloud-ready and
  offline by default.
- **`@stylenotes/shared`** (`packages/shared`, MIT): the contract shared with the
  cloud — Hybrid Logical Clock, sync envelope, wire DTOs, and entitlements. The
  cloud service consumes the same package so the shapes cannot drift.
- **Cloud client seam** in the app: `content/cloud-types.ts`,
  `content/cloud-client.ts` (the only HTTP caller), `db/cloud.ts`,
  `stores/cloud.svelte.ts`, and a **Cloud** section in Settings. Cloud stays
  disabled until a server URL is configured; entitlements default to the most
  restricted set.
- **OS-keychain session seam**: `src-tauri/src/cloud.rs`
  (`cloud_session_set/get/clear`) + `content/cloud-session.ts`. The session token
  goes to the OS credential store, never `localStorage` or SQLite.
- **OSS infrastructure**: `LICENSE` (AGPL-3.0), `packages/shared/LICENSE` (MIT),
  `CONTRIBUTING.md` (with CLA), `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub
  issue/PR templates, and a CI workflow.

### Changed

- **MCP is now a single in-app HTTP server.** The stdio sidecar
  (`stylenotes-mcp` binary, `bundle.externalBin`, `bun run mcp:sidecar`) and its
  E2E drivers are removed. The server runs in-process behind the remote
  Streamable HTTP listener (`src-tauri/src/remote_mcp/`, migration 22/23); the
  **Connect a client** guide is now a dedicated dialog that builds a Bearer-token
  HTTP config, so there is no local binary path to get wrong in a release build.
- `package.json` and `src-tauri/Cargo.toml` now declare `AGPL-3.0-only`.
- Root `package.json` is a bun workspace (`packages/*`); `bun run check:all`
  typechecks `packages/shared` and Vitest covers `packages/**`.

### Documentation

- Moved implemented (client) design docs to `docs/design/archive/` with an index.
  Cloud-service design docs are kept with the cloud service, not here.

### Added (vault folder, F0)

- **Vault folder mirror** (docs/design/vault-mirror.md). A workspace can point at a
  folder and export its notes as plain markdown plus an `attachments/` copy, so the
  folder can be backed up, read in any editor, or tracked with Git. SQLite stays
  the source of truth; nothing in the folder is ever read back yet.
  - Migration 25: `vault_links` (derived index) and `workspaces.vault_mode` /
    `vault_path` / `type`.
  - Rust `src-tauri/src/vault/`: safe path resolution (no traversal), atomic
    writes (`*.part` → `sync_all` → rename, replacing on Windows), and commands
    `vault_export_files` / `vault_copy_file` / `vault_read_files` / `vault_scan` /
    `vault_validate_root`.
  - Pure TS `vault-format.ts` / `vault-plan.ts` with 20 tests: stable frontmatter,
    `id` for rename-safe identity, platform-safe file names (reserved names,
    trailing dot/space, Unicode NFC).
  - **Settings → Vault**: choose a folder, pick `App only` / `Mirror to folder`,
    export on demand.
  - Cross-platform rules are implemented, not just documented (#V22).
- **Vault folder import (F1).** **Settings → Vault → Read from folder** brings files
  added or edited in the folder back into the app: new files become notes, a known
  file with a new hash updates its note, and the overwritten note is kept in Record
  History (`reason: 'vault'`). Import is additive — a missing file is reported as an
  orphan link, never an automatic delete. Conflict markers, Dropbox "conflicted
  copies", and truncated/empty known files are skipped, and attachments under
  `attachments/` are pulled into the store. Pure `content/vault-reconcile.ts`
  (`planSync`, 13 tests) plus `vault_import_attachment` in Rust.
- **Vault auto-sync (two-way).** A workspace can use mode **Two-way**: a 20-second
  cycle reads outside edits then writes them back (`startVaultSync`, wired into the
  workspace session). Read-then-write, with unchanged files skipped by hash, so the
  cycle terminates. A note is stored in Record History before the folder overwrites
  it. This is a poll; the `notify` watcher and the conflict dialog are still to come.
- **Vault conflict resolution.** When a note changes in both the app and the folder
  since the last sync (`updated_at > synced_at` and a changed file hash — never
  `updated_at` alone, since device clocks differ), the conflict waits in Settings →
  Vault. `VaultConflictDialog` shows both versions side by side with **Keep
  StyleNotes / Keep folder / Keep both**; the losing app version is kept in Record
  History (`reason: 'vault'`). Nothing is overwritten while a conflict is open.
- **Vault folder watcher.** A workspace in Two-way mode now reacts the moment a
  file changes: `src-tauri/src/vault/watch.rs` installs a recursive `notify`
  watcher and `vault_wait_change` parks one wait on a worker thread (answered over
  a Tauri channel, so the main thread never blocks). The 20-second poll stays as a
  backstop, because the folder scan — not the watcher — is the source of truth.
