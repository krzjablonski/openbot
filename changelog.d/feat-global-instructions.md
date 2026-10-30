### Added

- Settings > Agents has a "Global instructions" text, up to 2000 characters. This app's agents get it, from their next message. Local servers on this computer and joined servers do not get it.

### Fixed

- Pi and API-key agents also use a changed profile or memory from their next message. Before, they kept the old text until the process restarted.
- ACP agents and Muse get a short line in the first message after a resumed session or a changed instruction text. The line tells them that the new instructions replace the earlier instructions. Before, they could also follow the earlier instructions.
