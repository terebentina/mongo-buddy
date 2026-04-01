# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
