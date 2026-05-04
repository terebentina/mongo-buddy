# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.36.0](https://github.com/terebentina/mongo-buddy/compare/v1.35.0...v1.36.0) (2026-05-04)


### Features

* **query:** add Explain button to run query plan diagnostics ([9204cd9](https://github.com/terebentina/mongo-buddy/commit/9204cd9320c016bba26e91e2b184ea97ad3ace44))

## [1.35.0](https://github.com/terebentina/mongo-buddy/compare/v1.34.1...v1.35.0) (2026-05-04)


### Features

* **indexes:** drop indexes from the indexes modal ([0cddf4c](https://github.com/terebentina/mongo-buddy/commit/0cddf4c78b3ee6eef245f6bffff62c0d2415a18d))

## [1.34.1](https://github.com/terebentina/mongo-buddy/compare/v1.34.0...v1.34.1) (2026-04-30)


### Bug Fixes

* **import:** create target collection so empty imports succeed ([8b6136e](https://github.com/terebentina/mongo-buddy/commit/8b6136e8fa8186b2a35d42d7784d115076e980f0))

## [1.34.0](https://github.com/terebentina/mongo-buddy/compare/v1.33.0...v1.34.0) (2026-04-29)


### Features

* **sidebar:** add ghost databases for importing into new dbs ([25b4929](https://github.com/terebentina/mongo-buddy/commit/25b4929ffde1f25ba78e67f313b99089c9308670))

## [1.33.0](https://github.com/terebentina/mongo-buddy/compare/v1.32.0...v1.33.0) (2026-04-29)


### Features

* **drop:** selectively drop collections from database sidebar ([18427db](https://github.com/terebentina/mongo-buddy/commit/18427dbcb1585e8746ca07ba80495675e6365435))
* **export:** let users pick which collections to export ([ba5523a](https://github.com/terebentina/mongo-buddy/commit/ba5523a2fa5589b92ddc3d112a7da293523db9ba))

## [1.32.0](https://github.com/terebentina/mongo-buddy/compare/v1.31.3...v1.32.0) (2026-04-27)


### Features

* **mcp:** start MCP server by default, add --disable-mcp opt-out ([c4f7835](https://github.com/terebentina/mongo-buddy/commit/c4f783549e29165b163c710dccafe2d9e040e6e7))

## [1.31.3](https://github.com/terebentina/mongo-buddy/compare/v1.31.2...v1.31.3) (2026-04-27)

## [1.31.2](https://github.com/terebentina/mongo-buddy/compare/v1.31.1...v1.31.2) (2026-04-26)


### Bug Fixes

* **mcp:** bind test blocker to 0.0.0.0 to match server ([981b4a4](https://github.com/terebentina/mongo-buddy/commit/981b4a40a19ccb89accb4eb10a3c23d6a1a33977))

## [1.31.1](https://github.com/terebentina/mongo-buddy/compare/v1.31.0...v1.31.1) (2026-04-25)


### Bug Fixes

* **mcp:** bind server to 0.0.0.0 for WSL2 reachability ([871024c](https://github.com/terebentina/mongo-buddy/commit/871024c421fd101e4a915c10b805c30a7c1a1f00))

## [1.31.0](https://github.com/terebentina/mongo-buddy/compare/v1.30.0...v1.31.0) (2026-04-25)


### Features

* show app version in OS window title ([121c1dd](https://github.com/terebentina/mongo-buddy/commit/121c1dd578541fcf3affa053c52b1cd0e97d5b0d))

## [1.30.0](https://github.com/terebentina/mongo-buddy/compare/v1.29.3...v1.30.0) (2026-04-25)


### Features

* MCP deps + CLI args parser (closes [#32](https://github.com/terebentina/mongo-buddy/issues/32)) ([024d105](https://github.com/terebentina/mongo-buddy/commit/024d1050a3b32fc336779e524c99211bd603d246))
* MCP HTTP server bootstrap (closes [#34](https://github.com/terebentina/mongo-buddy/issues/34)) ([cb7a74f](https://github.com/terebentina/mongo-buddy/commit/cb7a74f21cbc6e46cb47e894cadebbb1902219e9)), closes [#31](https://github.com/terebentina/mongo-buddy/issues/31)
* MCP read-only tools wrapping MongoService (closes [#33](https://github.com/terebentina/mongo-buddy/issues/33)) ([7ffc4fc](https://github.com/terebentina/mongo-buddy/commit/7ffc4fcc8a2c741f00f29a4c0bc9265591eb1ad0))
* MCP status emitter + IPC + preload API (closes [#36](https://github.com/terebentina/mongo-buddy/issues/36)) ([0e90405](https://github.com/terebentina/mongo-buddy/commit/0e90405440b26da446b5fa379e9fe7bf7215438f))
* renderer MCP status pill + Sidebar integration (closes [#37](https://github.com/terebentina/mongo-buddy/issues/37)) ([e530875](https://github.com/terebentina/mongo-buddy/commit/e5308751d7b7f364752eb28950c4296b62b53282)), closes [#36](https://github.com/terebentina/mongo-buddy/issues/36)
* wire MCP into Electron main lifecycle (closes [#35](https://github.com/terebentina/mongo-buddy/issues/35)) ([97d74d0](https://github.com/terebentina/mongo-buddy/commit/97d74d0102c1d0266a9dd22c5d9af5d0ddb73d12))

## [1.29.3](https://github.com/terebentina/mongo-buddy/compare/v1.29.2...v1.29.3) (2026-04-24)

## [1.29.2](https://github.com/terebentina/mongo-buddy/compare/v1.29.1...v1.29.2) (2026-04-24)

## [1.29.1](https://github.com/terebentina/mongo-buddy/compare/v1.29.0...v1.29.1) (2026-04-23)


### Bug Fixes

* **editor:** make query editor render 3 rows initially ([569a409](https://github.com/terebentina/mongo-buddy/commit/569a409007242f135d9b6d0b14017c053cd2c74d))

## [1.29.0](https://github.com/terebentina/mongo-buddy/compare/v1.28.0...v1.29.0) (2026-04-23)


### Features

* **table:** add row number column to results table ([a1faf38](https://github.com/terebentina/mongo-buddy/commit/a1faf38e4c6b9ee8d745669b2c3197c927aff8c4))

## [1.28.0](https://github.com/terebentina/mongo-buddy/compare/v1.27.0...v1.28.0) (2026-04-23)


### Features

* **editor:** add undo/redo and bracket matching to all CodeMirror editors ([6373748](https://github.com/terebentina/mongo-buddy/commit/63737485d519be5a567b0a21815f7581982bd7c3))

## [1.27.0](https://github.com/terebentina/mongo-buddy/compare/v1.26.2...v1.27.0) (2026-04-20)


### Features

* **editor:** add Ctrl+F search and Ctrl+H replace to DocumentEditor ([56fa5da](https://github.com/terebentina/mongo-buddy/commit/56fa5da2597fc90ea02a83b10f5e171914a7764f))

## [1.26.2](https://github.com/terebentina/mongo-buddy/compare/v1.26.1...v1.26.2) (2026-04-19)


### Bug Fixes

* deserialize EJSON in find/count/aggregate/distinct filters ([895b3b1](https://github.com/terebentina/mongo-buddy/commit/895b3b1aacf57beab50ec049bc2eedcb16d0cfe4))

## [1.26.1](https://github.com/terebentina/mongo-buddy/compare/v1.26.0...v1.26.1) (2026-04-18)


### Bug Fixes

* use Dialog initialFocus to land cursor in editor ([188bc2f](https://github.com/terebentina/mongo-buddy/commit/188bc2fa7257cc5fbbe9313d9b8186aa9cbe4def))

## [1.26.0](https://github.com/terebentina/mongo-buddy/compare/v1.25.0...v1.26.0) (2026-04-18)


### Features

* auto-focus editor when opening DocumentEditor ([ed86eb9](https://github.com/terebentina/mongo-buddy/commit/ed86eb9b34f73905efe335310cffe2fac94f6a2e))

## [1.25.0](https://github.com/terebentina/mongo-buddy/compare/v1.24.0...v1.25.0) (2026-04-17)


### Features

* Show Distinct (Filtered) column menu item ([59d7946](https://github.com/terebentina/mongo-buddy/commit/59d7946aba1569dfe64c45eace5f27fb81976397))

## [1.24.0](https://github.com/terebentina/mongo-buddy/compare/v1.23.2...v1.24.0) (2026-04-17)


### Features

* collapse 3 export/import IPC handlers behind operation:start/cancel/update (closes [#26](https://github.com/terebentina/mongo-buddy/issues/26)) ([e6b99dd](https://github.com/terebentina/mongo-buddy/commit/e6b99ddd9a80a6019ff4ccdf3d1882e92b120337)), closes [#29](https://github.com/terebentina/mongo-buddy/issues/29)
* ConnectionManager module with TDD (closes [#17](https://github.com/terebentina/mongo-buddy/issues/17)) ([4db3bbb](https://github.com/terebentina/mongo-buddy/commit/4db3bbbf19d0c8e280dc7a27db4bb1551581d188)), closes [#14](https://github.com/terebentina/mongo-buddy/issues/14)
* ipc-handlers route connect/disconnect + history through ConnectionManager (closes [#19](https://github.com/terebentina/mongo-buddy/issues/19)) ([e37ff04](https://github.com/terebentina/mongo-buddy/commit/e37ff04c4c5ce8655761ea924c997743d9267f99)), closes [#18](https://github.com/terebentina/mongo-buddy/issues/18) [#20](https://github.com/terebentina/mongo-buddy/issues/20)
* MongoService streaming tests for export/import (closes [#25](https://github.com/terebentina/mongo-buddy/issues/25)) ([205abd1](https://github.com/terebentina/mongo-buddy/commit/205abd13b7b740a447769c0e76e26cbf6f5456df))
* MongoService uses ConnectionManager.requireClient (closes [#18](https://github.com/terebentina/mongo-buddy/issues/18)) ([60cd13e](https://github.com/terebentina/mongo-buddy/commit/60cd13e639f20e156e095979d5d67a8223b1a651)), closes [#19](https://github.com/terebentina/mongo-buddy/issues/19) [#20](https://github.com/terebentina/mongo-buddy/issues/20) [#19](https://github.com/terebentina/mongo-buddy/issues/19) [#19](https://github.com/terebentina/mongo-buddy/issues/19) [#19](https://github.com/terebentina/mongo-buddy/issues/19)
* OperationRegistry core + adapters with TDD (closes [#24](https://github.com/terebentina/mongo-buddy/issues/24)) ([a33aad4](https://github.com/terebentina/mongo-buddy/commit/a33aad44b424e80975d2874b124ac2febaf061af))
* preload exposes Result<ConnectedSession> + onConnectionState (closes [#20](https://github.com/terebentina/mongo-buddy/issues/20)) ([0aeea88](https://github.com/terebentina/mongo-buddy/commit/0aeea88ab86533ca6bbe57d7007e3d404fea90cb)), closes [#19](https://github.com/terebentina/mongo-buddy/issues/19) [#21](https://github.com/terebentina/mongo-buddy/issues/21)
* Preload: collapse 9 fns + 3 channels to 3 fns + 1 channel (closes [#27](https://github.com/terebentina/mongo-buddy/issues/27)) ([d7a2abc](https://github.com/terebentina/mongo-buddy/commit/d7a2abc174d73b3c9dcf2e43329fa7b3982cd480)), closes [#26](https://github.com/terebentina/mongo-buddy/issues/26) [#28](https://github.com/terebentina/mongo-buddy/issues/28) [#28](https://github.com/terebentina/mongo-buddy/issues/28)
* Renderer store collapses connect, subscribes to connection:state (closes [#21](https://github.com/terebentina/mongo-buddy/issues/21)) ([f46b0d1](https://github.com/terebentina/mongo-buddy/commit/f46b0d1cfe4ce49ebdcb8a1687b47f52e26d6bc7))
* useOperation hook + Sidebar refactor (closes [#28](https://github.com/terebentina/mongo-buddy/issues/28)) ([321cab8](https://github.com/terebentina/mongo-buddy/commit/321cab841a36bea03c00a55bb8636f19bd68ccb5))
* Wire main/index.ts + final verification (closes [#29](https://github.com/terebentina/mongo-buddy/issues/29)) ([6d466f0](https://github.com/terebentina/mongo-buddy/commit/6d466f06ad11c0b766d176bf58d4b4853b5533c2)), closes [#15](https://github.com/terebentina/mongo-buddy/issues/15)


### Bug Fixes

* **preload:** sync MongoApi type declaration with runtime API ([dd67cfa](https://github.com/terebentina/mongo-buddy/commit/dd67cfa573a4b38655b8e702c54e446ad30005e0))
* **table:** use unique React keys for document rows ([566f334](https://github.com/terebentina/mongo-buddy/commit/566f334effedeb7d7e2f4e55e84c1a22dfc80624))

## [1.23.4](https://github.com/terebentina/mongo-buddy/compare/v1.23.3...v1.23.4) (2026-04-17)

## [1.23.3](https://github.com/terebentina/mongo-buddy/compare/v1.23.2...v1.23.3) (2026-04-16)


### Bug Fixes

* **preload:** sync MongoApi type declaration with runtime API ([dd67cfa](https://github.com/terebentina/mongo-buddy/commit/dd67cfa573a4b38655b8e702c54e446ad30005e0))
* **table:** use unique React keys for document rows ([566f334](https://github.com/terebentina/mongo-buddy/commit/566f334effedeb7d7e2f4e55e84c1a22dfc80624))

## [1.23.2](https://github.com/terebentina/mongo-buddy/compare/v1.23.1...v1.23.2) (2026-04-15)


### Bug Fixes

* **store:** auto-execute query when restoring from history ([15414fb](https://github.com/terebentina/mongo-buddy/commit/15414fb101e741a2b468819a69fc6b695a6e95a9))

## [1.23.1](https://github.com/terebentina/mongo-buddy/compare/v1.23.0...v1.23.1) (2026-04-15)


### Bug Fixes

* **store:** sync filter state when restoring from query history ([f61f630](https://github.com/terebentina/mongo-buddy/commit/f61f6300a8f3d25e63bf9fb5c6012abf82433c0c))

## [1.23.0](https://github.com/terebentina/mongo-buddy/compare/v1.22.0...v1.23.0) (2026-04-15)


### Features

* **table:** right-align sort icon and column menu in headers ([b4d14ee](https://github.com/terebentina/mongo-buddy/commit/b4d14ee56716fffe0bbfca58d1754200280db814))

## [1.22.0](https://github.com/terebentina/mongo-buddy/compare/v1.21.0...v1.22.0) (2026-04-15)


### Features

* **table:** add column header menu with Show Distinct ([37627f3](https://github.com/terebentina/mongo-buddy/commit/37627f3f74c1bdf44c349258175529bc2d712bb4))

## [1.21.0](https://github.com/terebentina/mongo-buddy/compare/v1.20.0...v1.21.0) (2026-04-07)


### Features

* **sidebar:** add refresh option to database context menu ([62d817a](https://github.com/terebentina/mongo-buddy/commit/62d817a64c344111fb3e735a6fdab05c5437c731))

## [1.20.0](https://github.com/terebentina/mongo-buddy/compare/v1.19.0...v1.20.0) (2026-04-03)


### Features

* **export:** implement database-level export with progress tracking ([1463914](https://github.com/terebentina/mongo-buddy/commit/1463914cc406704d55d5cc34c88649d53c5fb91a))

## [1.19.0](https://github.com/terebentina/mongo-buddy/compare/v1.18.0...v1.19.0) (2026-04-02)


### Features

* **sidebar:** add context menu to database rows with import/export items ([ac5b4d5](https://github.com/terebentina/mongo-buddy/commit/ac5b4d5041bfe229f4e53623deb6fd3333ca9971))

## [1.18.0](https://github.com/terebentina/mongo-buddy/compare/v1.17.0...v1.18.0) (2026-04-02)


### Features

* **import:** allow importing multiple collections at once ([5ea6c76](https://github.com/terebentina/mongo-buddy/commit/5ea6c76998d9f5f58b6faf09a622c683fe31df11))

## [1.17.0](https://github.com/terebentina/mongo-buddy/compare/v1.16.1...v1.17.0) (2026-04-02)


### Features

* **sidebar:** show connection name in header instead of static "Databases" ([9c32f5c](https://github.com/terebentina/mongo-buddy/commit/9c32f5cf5d8a7c97d54e3af5459519e7ab9c94df))

## [1.16.1](https://github.com/terebentina/mongo-buddy/compare/v1.16.0...v1.16.1) (2026-04-02)


### Bug Fixes

* **table:** preserve other column widths when resizing a column ([fe44052](https://github.com/terebentina/mongo-buddy/commit/fe440529f79e62b6bee5ad72cb675ae87448c791))

## [1.16.0](https://github.com/terebentina/mongo-buddy/compare/v1.15.6...v1.16.0) (2026-04-01)


### Features

* **sidebar:** auto-expand single database on connect ([ee3a7a8](https://github.com/terebentina/mongo-buddy/commit/ee3a7a8635108d4f70c6c6ddc13b7578e0acbb0d))

## [1.15.6](https://github.com/terebentina/mongo-buddy/compare/v1.15.5...v1.15.6) (2026-03-31)


### Bug Fixes

* **editor:** add syntax highlighting for light mode ([b4b001f](https://github.com/terebentina/mongo-buddy/commit/b4b001f59dd2b44ca18c6cd6e49bd8ec20e354c6))

## [1.15.5](https://github.com/terebentina/mongo-buddy/compare/v1.4.0...v1.15.5) (2026-03-31)

## [1.15.4](https://github.com/terebentina/mongo-buddy/compare/v1.15.3...v1.15.4) (2026-03-31)

## [1.15.3](https://github.com/terebentina/mongo-buddy/compare/v1.15.2...v1.15.3) (2026-03-31)

## [1.15.2](https://github.com/terebentina/mongo-buddy/compare/v1.15.1...v1.15.2) (2026-03-31)

## [1.15.1](https://github.com/terebentina/mongo-buddy/compare/v1.15.0...v1.15.1) (2026-03-31)

## [1.15.0](https://github.com/terebentina/mongo-buddy/compare/v1.14.3...v1.15.0) (2026-03-31)


### Features

* **editor:** persist maximize/minimize state across edits ([44aa689](https://github.com/terebentina/mongo-buddy/commit/44aa68939e46c22324eeec03bfe844c2a63f2b08))
* **editor:** show collection name in document editor dialog title ([b281a2a](https://github.com/terebentina/mongo-buddy/commit/b281a2a45364ef3b4bed7e3dc60027b79f7cd5e7))

## [1.14.3](https://github.com/terebentina/mongo-buddy/compare/v1.14.2...v1.14.3) (2026-03-31)

## [1.14.2](https://github.com/terebentina/mongo-buddy/compare/v1.14.1...v1.14.2) (2026-03-30)


### Bug Fixes

* **import:** clear pickedFile after confirm so next import gets fresh name ([9690fab](https://github.com/terebentina/mongo-buddy/commit/9690fab65c35becfe35432295161c93f5c473184))

## [1.14.1](https://github.com/terebentina/mongo-buddy/compare/v1.14.0...v1.14.1) (2026-03-30)


### Bug Fixes

* **import:** reset pickedFile on dialog close so collection name updates ([88975d9](https://github.com/terebentina/mongo-buddy/commit/88975d9e23303cb7d9f4a719fb191c2263318388))

## [1.14.0](https://github.com/terebentina/mongo-buddy/compare/v1.13.3...v1.14.0) (2026-03-30)


### Features

* **connections:** sort saved connections alphabetically in Connect modal ([7b12619](https://github.com/terebentina/mongo-buddy/commit/7b126193f9c7397e3450b555bf09624982235578))
* **ui:** add Cancel button to exit edit mode in Connect modal ([23755f1](https://github.com/terebentina/mongo-buddy/commit/23755f1cbad3e60e176d53e3914d9e1dc36d4196))

## [1.13.3](https://github.com/terebentina/mongo-buddy/compare/v1.13.2...v1.13.3) (2026-03-29)

## [1.13.2](https://github.com/terebentina/mongo-buddy/compare/v1.13.1...v1.13.2) (2026-03-29)


### Bug Fixes

* **ui:** load saved connections on initial startup ([90e7db9](https://github.com/terebentina/mongo-buddy/commit/90e7db907130a7b39bc378a6c7c153797e0d61dc))

## [1.13.1](https://github.com/terebentina/mongo-buddy/compare/v1.13.0...v1.13.1) (2026-03-29)


### Bug Fixes

* **ui:** ensure popover renders above sticky table headers ([1108e7e](https://github.com/terebentina/mongo-buddy/commit/1108e7e6082bae412099de4aa9386f79d27afa16))

## [1.13.0](https://github.com/terebentina/mongo-buddy/compare/v1.12.0...v1.13.0) (2026-03-29)


### Features

* **query:** add clear button to reset filter and show all results ([14947cd](https://github.com/terebentina/mongo-buddy/commit/14947cd75eef90442998ba06dde07b442774eca2))

## [1.12.0](https://github.com/terebentina/mongo-buddy/compare/v1.11.2...v1.12.0) (2026-03-29)


### Features

* **history:** scope query history per connection by hostname+port ([b9abf7a](https://github.com/terebentina/mongo-buddy/commit/b9abf7a42bf7963bd19c0af7d523e577fe28a2f1))


### Bug Fixes

* **lint:** resolve all lint errors across codebase ([d0dab85](https://github.com/terebentina/mongo-buddy/commit/d0dab85e754f18d0a82800eb6fcf42f426bd370a))
* **ui:** close expand popover after copying value to clipboard ([dce8e72](https://github.com/terebentina/mongo-buddy/commit/dce8e72a495a2ec9842bd5f5a29887a1038f4c48))

## [1.11.2](https://github.com/terebentina/mongo-buddy/compare/v1.11.1...v1.11.2) (2026-03-29)

## [1.11.1](https://github.com/terebentina/mongo-buddy/compare/v1.11.0...v1.11.1) (2026-03-29)

## [1.11.0](https://github.com/terebentina/mongo-buddy/compare/v1.10.4...v1.11.0) (2026-03-28)


### Features

* add history entries for filter clicks and collection switches ([f3c6e7a](https://github.com/terebentina/mongo-buddy/commit/f3c6e7a25771080354e777fb633bdb82d0a15c29))


### Bug Fixes

* **test:** update DocumentEditor tests for CodeMirror and $oid ids ([da2ebd0](https://github.com/terebentina/mongo-buddy/commit/da2ebd0bd9dc1378f85ea5c03fa172ad714a096a))

## [1.10.4](https://github.com/terebentina/mongo-buddy/compare/v1.10.3...v1.10.4) (2026-03-28)

## [1.10.3](https://github.com/terebentina/mongo-buddy/compare/v1.10.2...v1.10.3) (2026-03-28)

## [1.10.2](https://github.com/terebentina/mongo-buddy/compare/v1.10.1...v1.10.2) (2026-03-27)


### Bug Fixes

* **editor:** use callback ref so CodeMirror mounts when dialog opens ([1a57327](https://github.com/terebentina/mongo-buddy/commit/1a57327544236813e393b44addf6e8d5ac2bf630))

## [1.10.1](https://github.com/terebentina/mongo-buddy/compare/v1.10.0...v1.10.1) (2026-03-27)

## [1.10.0](https://github.com/terebentina/mongo-buddy/compare/v1.9.0...v1.10.0) (2026-03-27)


### Features

* **editor:** add maximize/minimize toggle to document edit modal ([ba19d07](https://github.com/terebentina/mongo-buddy/commit/ba19d07cab1553c89a6d7455e309e6e8a482bdbd))
* **editor:** replace textarea with CodeMirror for JSON folding ([739dc9b](https://github.com/terebentina/mongo-buddy/commit/739dc9b69a15a2b047c491c4291ddb1e8a8ce329))

## [1.9.0](https://github.com/terebentina/mongo-buddy/compare/v1.8.0...v1.9.0) (2026-03-25)


### Features

* **table:** unwrap MongoDB extended JSON types in cell display ([2ea4579](https://github.com/terebentina/mongo-buddy/commit/2ea4579210dfd8a21b182109838e53aa06144991))

## [1.8.0](https://github.com/terebentina/mongo-buddy/compare/v1.7.5...v1.8.0) (2026-03-25)


### Features

* **table:** auto-resize column on double-click of resize handle ([47f6a95](https://github.com/terebentina/mongo-buddy/commit/47f6a9565c7fc8b6394662e2af2d44f189c701dd))

## [1.7.5](https://github.com/terebentina/mongo-buddy/compare/v1.7.4...v1.7.5) (2026-03-25)

## [1.7.4](https://github.com/terebentina/mongo-buddy/compare/v1.7.3...v1.7.4) (2026-03-25)

## [1.7.3](https://github.com/terebentina/mongo-buddy/compare/v1.7.2...v1.7.3) (2026-03-25)


### Bug Fixes

* **connections:** clear input fields when connection dialog opens ([f140eeb](https://github.com/terebentina/mongo-buddy/commit/f140eeb901a4c40d908ba379680329d4e5cd8846))

## [1.7.2](https://github.com/terebentina/mongo-buddy/compare/v1.7.1...v1.7.2) (2026-03-25)

## [1.7.1](https://github.com/terebentina/mongo-buddy/compare/v1.7.0...v1.7.1) (2026-03-25)

## [1.7.0](https://github.com/terebentina/mongo-buddy/compare/v1.6.6...v1.7.0) (2026-03-25)


### Features

* **connections:** add edit button for saved connections ([fab2465](https://github.com/terebentina/mongo-buddy/commit/fab2465bc972e69aedc1377a1c41eddd026fe3bc))

## [1.6.6](https://github.com/terebentina/mongo-buddy/compare/v1.6.5...v1.6.6) (2026-03-23)


### Bug Fixes

* bundle mongodb into main process to fix module resolution in packaged app ([2eba633](https://github.com/terebentina/mongo-buddy/commit/2eba6337522e1e1789af415f7354a64fe55f86e7))

## [1.6.5](https://github.com/terebentina/mongo-buddy/compare/v1.6.4...v1.6.5) (2026-03-23)


### Bug Fixes

* resolve ESM migration breakages preventing MongoDB connection ([5c78116](https://github.com/terebentina/mongo-buddy/commit/5c78116d7d17d15a7a485c08561ea2f6b96d0f95))

## [1.6.4](https://github.com/terebentina/mongo-buddy/compare/v1.6.3...v1.6.4) (2026-03-23)

## [1.6.3](https://github.com/terebentina/mongo-buddy/compare/v1.6.2...v1.6.3) (2026-03-23)


### Bug Fixes

* reset filter to {} when switching collections ([a7fb01e](https://github.com/terebentina/mongo-buddy/commit/a7fb01e37e803da8143486213d04e8babb712edb))

## [1.6.2](https://github.com/terebentina/mongo-buddy/compare/v1.6.1...v1.6.2) (2026-03-23)


### Bug Fixes

* use opaque solid color for even-row icon backgrounds ([07a8b45](https://github.com/terebentina/mongo-buddy/commit/07a8b45543fce83612a85f4aa4e35f6a3735938b))

## [1.6.1](https://github.com/terebentina/mongo-buddy/compare/v1.6.0...v1.6.1) (2026-03-23)


### Bug Fixes

* add background to cell hover icons to prevent text overlap ([3bd98bf](https://github.com/terebentina/mongo-buddy/commit/3bd98bfb75d3fa03f7e0b50ee68fc8834fb3b702))

## [1.6.0](https://github.com/terebentina/mongo-buddy/compare/v1.5.0...v1.6.0) (2026-03-23)


### Features

* require explicit connection before accessing databases ([070ca3e](https://github.com/terebentina/mongo-buddy/commit/070ca3e774d093cbca14ba05c2d6a4321cf08b6c))

## [1.5.0](https://github.com/terebentina/mongo-buddy/compare/v1.4.2...v1.5.0) (2026-03-23)


### Features

* set 150px minimum column width with horizontal scroll ([00c36cf](https://github.com/terebentina/mongo-buddy/commit/00c36cfe51af855df5cc0e79b4a9ba08e8354e80))

## [1.4.2](https://github.com/terebentina/mongo-buddy/compare/v1.4.1...v1.4.2) (2026-03-23)


### Bug Fixes

* keep sort icons inside column bounds on narrow columns ([fb84969](https://github.com/terebentina/mongo-buddy/commit/fb84969aefa6055a166d37f630b6484ce34ea6d7))

## [1.4.1](https://github.com/terebentina/mongo-buddy/compare/v1.4.0...v1.4.1) (2026-03-22)


### Bug Fixes

* prevent table columns from being narrower than headers ([9d55f1b](https://github.com/terebentina/mongo-buddy/commit/9d55f1bd9468f5f262cdc11ed5f2050eca47549a))

## [1.4.0](https://github.com/terebentina/mongo-buddy/compare/v1.3.0...v1.4.0) (2026-03-22)


### Features

* hide menu bar, improve table header styling ([e575793](https://github.com/terebentina/mongo-buddy/commit/e575793373bd1bc19e0b94fe002c14a01b240c96))

## [1.3.0](https://github.com/terebentina/mongo-buddy/compare/v1.2.0...v1.3.0) (2026-03-22)


### Features

* QOL ([ef3492f](https://github.com/terebentina/mongo-buddy/commit/ef3492f2ab098c642bcdf0ac2d77fb7b1dad752b))


### Bug Fixes

* add author ([0e1ff39](https://github.com/terebentina/mongo-buddy/commit/0e1ff391339027858b02d837c7cdc2a681bb7e25))

## [1.2.0](https://github.com/terebentina/mongo-buddy/compare/v1.1.1...v1.2.0) (2026-03-22)


### Features

* US-001 - Compact table styling ([d011a59](https://github.com/terebentina/mongo-buddy/commit/d011a599a248842d2df79ddae2c0fa5b20138060))
* US-002 - Store: addFilterValue action and pendingFilterText ([275d37d](https://github.com/terebentina/mongo-buddy/commit/275d37d12bc541bbf8f4303f224411a86fb78fa0))
* US-003 - QueryEditor: consume pendingFilterText ([c57d9e9](https://github.com/terebentina/mongo-buddy/commit/c57d9e927985efaa752e76bff5195b5052091298))
* US-004 - DocumentTable: filter-by-cell icon ([211e8f2](https://github.com/terebentina/mongo-buddy/commit/211e8f271b5efe07f433d15bd6b6c1613b023c73))

## [1.1.1](https://github.com/terebentina/mongo-buddy/compare/v1.1.0...v1.1.1) (2026-03-22)


### Bug Fixes

* prevent table from pushing pagination out of view ([d7fb216](https://github.com/terebentina/mongo-buddy/commit/d7fb2163bf3305b6ea0c9405f63dab6d21a8fb0a))

## [1.1.0](https://github.com/terebentina/mongo-buddy/compare/v1.0.0...v1.1.0) (2026-03-22)


### Features

* US-001 - Sticky headers and zebra striping ([976b1ba](https://github.com/terebentina/mongo-buddy/commit/976b1baf5d95d1ef4e71bf5dbca432903146a13d))
* US-002 - Table-layout fixed, ellipsis, and resizable columns ([0e31e1c](https://github.com/terebentina/mongo-buddy/commit/0e31e1c34970d7777c31177726acd59c7b6c285d))
* US-003 - Cell popover with copy ([0331323](https://github.com/terebentina/mongo-buddy/commit/0331323b3d36c11c7d2da44da5e99a153a93762f))
* US-004 - Server-side column sorting ([c8dd55c](https://github.com/terebentina/mongo-buddy/commit/c8dd55c783be37a3eaaaf282594bab74c2c6c335))
* US-005 - Pagination jump-to-page and page size selector ([1513eaf](https://github.com/terebentina/mongo-buddy/commit/1513eaff1d570d6ad4f516f6452b7ae78efeebbf))

## 1.0.0 (2026-03-22)


### Features

* add field autocomplete in queries ([1d5c1ba](https://github.com/terebentina/mongo-buddy/commit/1d5c1baaba1a53482297b233485b050b948ee0ed))
* S1 - Project Scaffold + Config ([960350c](https://github.com/terebentina/mongo-buddy/commit/960350c011e90f79bcdf0a5e8d856f4c97daafde))
* S1 - Project Scaffold + Config ([c06a41e](https://github.com/terebentina/mongo-buddy/commit/c06a41e6e21c69d8bf8140835ad78d8f6be7b2c6))
* S10 - Polish ([3713f47](https://github.com/terebentina/mongo-buddy/commit/3713f47f1b7426693f529e7e0db4c52edc16e31f))
* S10 - Polish ([3bd565e](https://github.com/terebentina/mongo-buddy/commit/3bd565e2fbcab1e363339bbae30e13c50cfccd0b))
* S2 - MongoService TDD ([3be09da](https://github.com/terebentina/mongo-buddy/commit/3be09dafbb412ec984c6bfada263001a21434b58))
* S2 - MongoService TDD ([491d7ff](https://github.com/terebentina/mongo-buddy/commit/491d7ff64b660b24484b2480f07f104a24698c4a))
* S3 - IPC + Preload Bridge ([763ef18](https://github.com/terebentina/mongo-buddy/commit/763ef183c38a71c001c816acddbc91f9dd9718d5))
* S3 - IPC + Preload Bridge ([2d0a0ac](https://github.com/terebentina/mongo-buddy/commit/2d0a0acdb6b99fa017be7e94e8073b1220ea0965))
* S4 - Zustand Store TDD ([6fe262e](https://github.com/terebentina/mongo-buddy/commit/6fe262eff0b1b2dc7fdbd5370cd59313369a0950))
* S4 - Zustand Store TDD ([3f73085](https://github.com/terebentina/mongo-buddy/commit/3f73085be2e28dd498cf377efaab1fe0ccd4371a))
* S5 - Connection Dialog + Sidebar ([7abbcce](https://github.com/terebentina/mongo-buddy/commit/7abbcce7abe4942e27e5d0e91a6fb0fff25c4adc))
* S5 - Connection Dialog + Sidebar ([71fbacd](https://github.com/terebentina/mongo-buddy/commit/71fbacd2f74ef705ea50f6e2f80ffbf4c6c9e421))
* S6 - Document Table ([07c851d](https://github.com/terebentina/mongo-buddy/commit/07c851db9d1c290a37e9f5b972345301234b3611))
* S6 - Document Table ([91362d4](https://github.com/terebentina/mongo-buddy/commit/91362d4c74fde794b78337de3eb102afb8034b42))
* S7 - Saved Connections ([236397f](https://github.com/terebentina/mongo-buddy/commit/236397f7c81253685e8982242e0b2326105dcd12))
* S7 - Saved Connections ([942d380](https://github.com/terebentina/mongo-buddy/commit/942d3800a96542261ee5addda0bf379d2df442d3))
* S8 - Query Editor ([e25c6c0](https://github.com/terebentina/mongo-buddy/commit/e25c6c0f497903131397b4fd7ae19c4728c81345))
* S8 - Query Editor ([c144fd4](https://github.com/terebentina/mongo-buddy/commit/c144fd4ab4b7b72bd67ada2e33ab15f917559fbf))
* S9 - Document CRUD ([53911bc](https://github.com/terebentina/mongo-buddy/commit/53911bcc94f36ba2278dde6208b10e6bda3ff754))
* S9 - Document CRUD ([64be236](https://github.com/terebentina/mongo-buddy/commit/64be23626fb4a1d7d70dd31033f7c8908f07b8d4))


### Bug Fixes

* bundle mongodb and electron-store into main process for packaged app ([3a656d6](https://github.com/terebentina/mongo-buddy/commit/3a656d6127d21e08eac8b2352e689a2feff5778b))
