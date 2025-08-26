# Complete Steam Launch Options Reference

Steam launch options are command-line parameters that modify game behavior, performance, and compatibility. These options are set through Steam's Properties menu (right-click game → Properties → General → Launch Options).

This reference covers over 200 documented Steam launch options, from universal parameters to game-specific tweaks. The options range from simple performance improvements to advanced debugging tools, providing users with extensive control over their gaming experience. 

## Universal Steam Launch Options

These options work across multiple games and engines, providing consistent functionality regardless of the specific title.

### Core Display Options
- **`-novid`** - Skips intro videos and startup movies. Works with most Source engine games and many others. Essential for faster game startup.
- **`-windowed`** or **`-sw`** - Forces windowed mode across all platforms. Universal compatibility with most games.
- **`-fullscreen`** - Forces fullscreen mode. Works universally across games and platforms.
- **`-noborder`** - Creates borderless window mode. Ideal for multi-monitor setups and alt-tabbing.
- **`-w [width] -h [height]`** - Sets custom resolution (e.g., `-w 1920 -h 1080`). Works with most games across all platforms.
- **`-refresh [rate]`** or **`-freq [rate]`** - Sets refresh rate (e.g., `-refresh 144`). Primarily for Source engine games.

### Graphics API Selection
- **`-dx9`** - Forces DirectX 9 renderer. Works with Source engine games on Windows.
- **`-dx11`** - Forces DirectX 11 renderer. Available in newer games supporting DX11.
- **`-dx12`** - Forces DirectX 12 renderer. Limited to games with explicit DX12 support.
- **`-gl`** - Forces OpenGL renderer. Works on Windows, Mac, and Linux for Source engine games.
- **`-vulkan`** - Forces Vulkan renderer. Requires Vulkan-capable GPU and drivers.
- **`-opengl`** - Forces OpenGL rendering. Universal OpenGL option for compatible games.

### Performance and System Options
- **`-high`** - Sets process priority to High. Universal across games but may cause system instability.
- **`-console`** - Enables developer console. Works with most Source engine games.
- **`-nosound`** - Disables all audio. Universal compatibility for performance testing.
- **`-nojoy`** - Disables joystick support. Works across most games to reduce input processing overhead.

## DirectX Level Options

These legacy options control DirectX feature levels, primarily for Source engine games.

### Working DirectX Options
- **`-dxlevel 80`** - DirectX 8.0 with Pixel Shader 1.1. **Deprecated** - causes compatibility issues.
- **`-dxlevel 81`** - DirectX 8.1. **Deprecated** - causes compatibility issues.
- **`-dxlevel 90`** - DirectX 9.0 with Pixel Shader 2.0b. Still functional for older systems.
- **`-dxlevel 95`** - DirectX 9.0+ with Pixel Shader 3.0. **Recommended** default for modern hardware.
- **`-dxlevel 100`** - Left 4 Dead engine branch only. **Deprecated** in newer games.

**Important**: Remove `-dxlevel` parameters after first launch to prevent configuration conflicts.

### Deprecated DirectX Options
- **`-dxlevel 60`** - DirectX 6. **Removed** - causes crashes.
- **`-dxlevel 70`** - DirectX 7. **Removed** - causes immediate crashes (Steam warning issued).

## Source Engine Launch Options

Source engine games (Half-Life, Counter-Strike, Team Fortress 2, Portal, Left 4 Dead, Garry's Mod) support the most extensive launch options.

### Performance Optimization
- **`+mat_queue_mode 2`** - Enables multi-core rendering. **High impact** performance improvement.
- **`-threads [number]`** - Sets CPU thread count. Source engine caps at 3 threads due to performance issues.
- **`-nopreload`** - Disables model preloading. Improves performance on low-end systems.
- **`-softparticlesdefaultoff`** - Disables particle blending effects. Significant FPS improvement.
- **`+fps_max 0`** - Removes FPS cap. Essential for competitive gaming.

### Audio System Options
- **`-primarysound`** - Forces primary sound buffer. Fixes audio issues on some systems.
- **`-sndspeed [rate]`** - Sets sound sampling rate. Controls audio quality vs performance.
- **`-sndmono`** - Forces mono audio. Reduces audio processing overhead.

### Network and Server Options
- **`+connect [ip:port]`** - Connects to specific server on startup.
- **`-clientport [port]`** - Sets client network port.
- **`-insecure`** - Disables VAC protection. **Blocks VAC-secured servers**.
- **`-enablefakeip`** - Uses Steam Datagram Relay for improved security.

### Game-Specific Source Engine Options

#### Counter-Strike: Global Offensive / Counter-Strike 2
```
-novid -console -freq 144 +fps_max 0 +mat_queue_mode 2 -high -nojoy
```
- **`-tickrate 128`** - Sets server tickrate. **CS:GO only** - obsolete in CS2.
- **`-d3d9ex`** - Enables Direct3D 9Ex. **CS:GO only** - not functional in CS2.
- **`+cl_forcepreload 1`** - Preloads resources. Performance improvement for sufficient RAM.

#### Team Fortress 2
```
-novid -nojoy -nosteamcontroller -nohltv -particles 1 -precachefontchars +mat_queue_mode 2
```
- **`-particles [number]`** - Sets particle limit. Minimum 512 for proper gameplay.
- **`-precachefontchars`** - Preloads font characters. Reduces text rendering hitches.
- **`-sillygibs`** - Enables silly gibs mode. Cosmetic modification.

#### Left 4 Dead Series
```
-novid -console -high -nojoy -useallavailablecores +mat_motion_blur_percent_of_screen_max 0
```
- **`-useallavailablecores`** - Uses all CPU cores. **Specific to L4D series**.
- **`+allow_all_bot_survivor_team 1`** - Enables all-bot gameplay.

#### Garry's Mod
```
-nojoy -nosteamcontroller -softparticlesdefaultoff -multirun -noaddons +exec autoexec.cfg
```
- **`-multirun`** - Allows multiple instances. **GMod-specific** feature.
- **`-noaddons`** - Disables legacy addons. Performance improvement.
- **`-noworkshop`** - Disables Workshop addons. For troubleshooting.

## Unity Engine Launch Options

Unity games support extensive customization through standardized launch parameters.

### Graphics and Rendering
- **`-force-d3d11`** - Forces DirectX 11 rendering (Windows only).
- **`-force-d3d12`** - Forces DirectX 12 rendering (Windows only).
- **`-force-vulkan`** - Forces Vulkan rendering API.
- **`-force-opengl`** - Forces OpenGL rendering (legacy).
- **`-force-metal`** - Forces Metal rendering (macOS only).
- **`-screen-quality [level]`** - Sets quality preset (Fastest/Fast/Simple/Good/Beautiful/Fantastic).

### Performance and Memory
- **`-nographics`** - Runs without graphics initialization (headless mode).
- **`-nolog`** - Disables logging for slight performance improvement.
- **`-no-stereo-rendering`** - Disables stereo/VR rendering.
- **`-systemallocator`** - Forces system memory allocator for debugging.

### Display Configuration
- **`-screen-width [pixels]`** - Sets window width.
- **`-screen-height [pixels]`** - Sets window height.
- **`-screen-fullscreen [0|1]`** - Overrides fullscreen state.
- **`-monitor [N]`** - Runs on specific monitor (1-based index).
- **`-popupwindow`** - Creates borderless popup window.

### Unity Game Examples

#### Cities: Skylines
```
-limitfps 60 -screen-quality Beautiful -force-d3d11 -noWorkshop
```
- **`-limitfps [fps]`** - Frame rate limiter specific to Cities: Skylines.
- **`-noWorkshop`** - Disables Workshop content for troubleshooting.

#### Lethal Company
```
-nolog -no-stereo-rendering -screen-quality Fastest -force-d3d11-no-singlethreaded
```

## Unreal Engine Launch Options

Unreal Engine games support comprehensive launch parameters for graphics, performance, and development.

### Graphics and Rendering
- **`-d3d10`** - Forces DirectX 10 rendering.
- **`-d3d11`** - Forces DirectX 11 rendering.
- **`-d3d12`** - Forces DirectX 12 rendering.
- **`-vulkan`** - Forces Vulkan rendering API.
- **`-sm4`** - Forces Shader Model 4 (DirectX 10). **Significant performance improvement**.
- **`-sm5`** - Forces Shader Model 5 (DirectX 11).

### Performance and System
- **`-USEALLAVAILABLECORES`** - Uses all available CPU cores.
- **`-ONETHREAD`** - Forces single-threaded execution.
- **`-FPS=[value]`** - Sets target framerate.
- **`-notexturestreaming`** - Disables texture streaming.
- **`-lowmemory`** - Enables low memory mode.
- **`-malloc=[system]`** - Specifies memory allocator.

### Display Configuration
- **`-ResX=[width]`** - Sets horizontal resolution.
- **`-ResY=[height]`** - Sets vertical resolution.
- **`-WinX=[x] -WinY=[y]`** - Sets window position.
- **`-borderless`** - Forces borderless window.
- **`-vsync`** / **`-novsync`** - Controls vertical synchronization.

### Debugging and Development
- **`-log`** - Enables logging.
- **`-debug`** - Enables debug mode.
- **`-stat`** - Enables statistics display.
- **`-ProfileGPU`** - Enables GPU profiling.
- **`-benchmark`** - Enables benchmark mode.

### Unreal Engine Game Examples

#### ARK: Survival Evolved
```
-USEALLAVAILABLECORES -sm4 -d3d10 -nomansky -lowmemory -malloc=system
```
- **`-nomansky`** - Disables sky effects for FPS boost.
- **`-malloc=system`** - Uses system memory allocator.

#### Satisfactory
```
-dx11 -ResX=1920 -ResY=1080 -windowed -USEALLAVAILABLECORES
```

## Game-Specific Launch Options

### Grand Theft Auto V
```
-anisotropicQualityLevel 0 -fxaa 0 -grassQuality 0 -textureQuality 1 -shadowQuality 0
```
- **`-anisotropicQualityLevel [0-16]`** - Anisotropic filtering quality.
- **`-fxaa [0-3]`** - FXAA quality level.
- **`-grassQuality [0-5]`** - Grass rendering quality.
- **`-textureQuality [0-2]`** - Texture quality (most important setting).
- **`-noInGameDOF`** - Disables depth of field effects.

### Rust
```
-high -USEALLAVAILABLECORES -gc.buffer 2048 -malloc=system -maxMem=16384
```
- **`-gc.buffer [size]`** - Increases garbage collection buffer.
- **`-maxMem=[MB]`** - Sets maximum memory usage.
- **`-cpuCount=[number]`** - Specifies CPU core count.
- **`-graphics.lodbias [value]`** - Controls level of detail bias.

### VR Games (VRChat)
```
--no-vr --fps=90 --enable-debug-gui --affinity=FFFF
```
- **`--no-vr`** - Forces desktop mode.
- **`--fps=[value]`** - Overrides FPS cap.
- **`--affinity=[hex]`** - Sets CPU affinity (for AMD multi-CCX CPUs).
- **`--osc=inPort:outIP:outPort`** - OSC configuration.

## Legacy and Deprecated Options

### High-Risk Deprecated Options
- **`-dxlevel 60`** / **`-dxlevel 70`** - **Removed** - cause crashes.
- **`-heapsize [size]`** - **Deprecated** - causes crashes on modern systems.
- **`-32bit`** - **Removed** from most modern games.
- **`-16bpp`** - **Deprecated** - not supported on modern systems.

### Steam Client Legacy Options
- **`-no-browser`** - **Deprecated January 2023** - disabled CEF components.
- **`-noreactlogin`** - **Deprecated** - used old login UI.
- **`-oldbigpicture`** - **Deprecated** - used old Big Picture Mode.

### Still-Working Legacy Options
- **`-software`** - Software rendering. **Extremely slow** but functional.
- **`-autoconfig`** - Resets graphics settings to defaults.
- **`-safe`** - Launches in safe mode with minimal settings.
- **`-force_vendor_id [id]`** - Forces GPU vendor ID for compatibility.

## Advanced Debugging and Development

### Developer Console Options
- **`-dev`** - Enables developer mode.
- **`-condebug`** - Logs console output to file.
- **`-allowdebug`** - Allows debug modules.
- **`-tools`** - Launches in tools mode (Source games).

### Performance Monitoring
- **`-showfps`** - Shows FPS counter.
- **`-timeoverlay`** - Shows time overlay.
- **`-log_voice`** - Logs Steam voice chat data.
- **`-ProfileGPU`** - Enables GPU profiling (Unreal Engine).

## Common Launch Option Configurations

### Competitive Gaming Setup
```
-novid -console -freq 144 +fps_max 0 +mat_queue_mode 2 -high -nojoy -softparticlesdefaultoff
```

### Performance Optimization (Low-End Systems)
```
-novid -dxlevel 81 -nojoy -nosteamcontroller -nosound -windowed -w 1024 -h 768
```

### Development and Testing
```
-dev -console -windowed -noborder -w 1280 -h 720 +sv_cheats 1 -allowdebug
```

### VR Gaming
```
-openvr -hmd=SteamVR -vrmode oculus -refresh 90
```

## Platform-Specific Considerations

### Windows
- Full DirectX support with all versions (DX9, DX11, DX12)
- Advanced process priority controls available
- Comprehensive hardware-specific options

### macOS
- OpenGL and Metal preferred over DirectX
- **`-force-low-power-device`** - Uses integrated GPU for battery life
- Limited support for Windows-specific options

### Linux
- OpenGL and Vulkan preferred rendering APIs
- **`-force-wayland`** - Experimental Wayland support (Unity)
- Steam Linux Runtime affects option compatibility

### Steam Deck
- **`-gamepadui`** - Enables gamepad-optimized UI
- **`-steamdeck`** - Pretends to be Steam Deck for compatibility
- Specific compatibility layer considerations

## Security and Safety Guidelines

### High-Risk Options to Avoid
- **`-allow_third_party_software`** - Reduces security, allows code injection
- **`-insecure`** - Disables VAC protection
- **`-dxlevel 60/70`** - Cause immediate crashes
- **`-high`** - May cause system instability

### Best Practices
1. **Test incrementally** - Add options one at a time
2. **Remove problematic options** - Especially `-dxlevel` after first launch
3. **Monitor performance** - Not all options improve every system
4. **Backup configurations** - Document working setups
5. **Check compatibility** - Verify options work with your specific game version

## Implementation Guide

### Setting Launch Options
1. Open Steam Library
2. Right-click target game
3. Select "Properties"
4. Navigate to "General" tab
5. Enter parameters in "Launch Options" field
6. Separate multiple options with spaces

### Example Implementation
```
-novid -console -windowed -w 1920 -h 1080 -freq 144 +fps_max 0 +mat_queue_mode 2
```