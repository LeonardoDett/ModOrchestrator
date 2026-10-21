package skyrimse

import (
	"modorchestrator/sdk"
	"modorchestrator/sdk/game"
	"modorchestrator/sdk/tool"
)

var _ sdk.ToolSupport = Adapter{}

// KnownTools are the tools of the Skyrim SE modding workflow (core/12 §9,
// D146), offered as suggestions on the Tools screen. Executables that only
// differ by a command line argument from the tool of another game (xEdit,
// DynDOLOD, TexGen) carry the argument that selects Skyrim SE. Paths are
// where the tool is installed below the game root when it is installed
// that way (as a mod or by its own installer); the others are located by
// the user. Every one writes into the game data while it runs, so they are
// exclusive and deploy first by default.
func (Adapter) KnownTools(id game.ID) []tool.Known {
	if id != GameID {
		return nil
	}
	return []tool.Known{
		{
			ID: "xedit", Name: "SSEEdit (xEdit)",
			Executables: []tool.Executable{{File: "SSEEdit64.exe"}, {File: "SSEEdit.exe"}, {File: "xEdit64.exe", Args: "-SSE"}, {File: "xEdit.exe", Args: "-SSE"}},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "wrye_bash", Name: "Wrye Bash",
			Executables: []tool.Executable{{File: "Wrye Bash.exe"}},
			Paths:       []string{"Mopy"},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "nemesis", Name: "Nemesis",
			Executables: []tool.Executable{{File: "Nemesis Unlimited Behavior Engine.exe"}},
			Paths:       []string{"Data/Nemesis_Engine"},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "pandora", Name: "Pandora Behaviour Engine",
			Executables: []tool.Executable{{File: "Pandora Behaviour Engine+.exe"}},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "bodyslide", Name: "BodySlide",
			Executables: []tool.Executable{{File: "BodySlide x64.exe"}, {File: "BodySlide.exe"}},
			Paths:       []string{"Data/CalienteTools/BodySlide"},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "texgen", Name: "TexGen",
			Executables: []tool.Executable{{File: "TexGenx64.exe", Args: "-sse"}, {File: "TexGen.exe", Args: "-sse"}},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "dyndolod", Name: "DynDOLOD",
			Executables: []tool.Executable{{File: "DynDOLODx64.exe", Args: "-sse"}, {File: "DynDOLOD.exe", Args: "-sse"}},
			Exclusive:   true, DeployBefore: true,
		},
		{
			ID: "creation_kit", Name: "Creation Kit",
			Executables: []tool.Executable{{File: "CreationKit.exe"}},
			Paths:       []string{""},
			Exclusive:   true, DeployBefore: true,
		},
	}
}
