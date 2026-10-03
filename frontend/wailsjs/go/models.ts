export namespace bridge {
	
	export class ConflictsSummaryDTO {
	    pairs: number;
	    unreviewed: number;
	    overrides: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictsSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pairs = source["pairs"];
	        this.unreviewed = source["unreviewed"];
	        this.overrides = source["overrides"];
	    }
	}
	export class ModsSummaryDTO {
	    enabled: number;
	    total: number;
	    size: number;
	    files: number;
	
	    static createFrom(source: any = {}) {
	        return new ModsSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.total = source["total"];
	        this.size = source["size"];
	        this.files = source["files"];
	    }
	}
	export class LocationDTO {
	    target: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new LocationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.target = source["target"];
	        this.path = source["path"];
	    }
	}
	export class DeployFailureDTO {
	    location: LocationDTO;
	    action?: string;
	    code: string;
	
	    static createFrom(source: any = {}) {
	        return new DeployFailureDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.action = source["action"];
	        this.code = source["code"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ForeignFindingDTO {
	    kind: string;
	    target?: string;
	    name: string;
	    instance?: string;
	
	    static createFrom(source: any = {}) {
	        return new ForeignFindingDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.target = source["target"];
	        this.name = source["name"];
	        this.instance = source["instance"];
	    }
	}
	export class ProfileRefDTO {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class DeployStatusDTO {
	    instance: string;
	    kind: string;
	    reason: string;
	    activeProfile: ProfileRefDTO;
	    appliedProfile?: ProfileRefDTO;
	    appliedAt?: string;
	    method: string;
	    entries: number;
	    busy?: string;
	    pendingDecision?: string;
	    externalChanges: number;
	    newFiles: number;
	    foreign: ForeignFindingDTO[];
	    failures: DeployFailureDTO[];
	
	    static createFrom(source: any = {}) {
	        return new DeployStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.kind = source["kind"];
	        this.reason = source["reason"];
	        this.activeProfile = this.convertValues(source["activeProfile"], ProfileRefDTO);
	        this.appliedProfile = this.convertValues(source["appliedProfile"], ProfileRefDTO);
	        this.appliedAt = source["appliedAt"];
	        this.method = source["method"];
	        this.entries = source["entries"];
	        this.busy = source["busy"];
	        this.pendingDecision = source["pendingDecision"];
	        this.externalChanges = source["externalChanges"];
	        this.newFiles = source["newFiles"];
	        this.foreign = this.convertValues(source["foreign"], ForeignFindingDTO);
	        this.failures = this.convertValues(source["failures"], DeployFailureDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FindingDTO {
	    kind: string;
	    target?: string;
	    name: string;
	    instance?: string;
	
	    static createFrom(source: any = {}) {
	        return new FindingDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.target = source["target"];
	        this.name = source["name"];
	        this.instance = source["instance"];
	    }
	}
	export class ModTypeDTO {
	    id: string;
	    name: string;
	    target: string;
	    methods?: string[];
	
	    static createFrom(source: any = {}) {
	        return new ModTypeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.target = source["target"];
	        this.methods = source["methods"];
	    }
	}
	export class TargetDTO {
	    id: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new TargetDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	    }
	}
	export class ManagedGameDTO {
	    id: string;
	    gameId: string;
	    gameName: string;
	    custom: boolean;
	    name: string;
	    adapter: string;
	    store: string;
	    root: string;
	    staging: string;
	    archiveStore: string;
	    backupStore: string;
	    method: string;
	    executable?: string;
	    version?: string;
	    active: boolean;
	    hidden: boolean;
	    unavailable: boolean;
	    rootMissing: boolean;
	    deployed: boolean;
	    capabilities: string[];
	    targets: TargetDTO[];
	    modTypes: ModTypeDTO[];
	    foreign: FindingDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ManagedGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.gameId = source["gameId"];
	        this.gameName = source["gameName"];
	        this.custom = source["custom"];
	        this.name = source["name"];
	        this.adapter = source["adapter"];
	        this.store = source["store"];
	        this.root = source["root"];
	        this.staging = source["staging"];
	        this.archiveStore = source["archiveStore"];
	        this.backupStore = source["backupStore"];
	        this.method = source["method"];
	        this.executable = source["executable"];
	        this.version = source["version"];
	        this.active = source["active"];
	        this.hidden = source["hidden"];
	        this.unavailable = source["unavailable"];
	        this.rootMissing = source["rootMissing"];
	        this.deployed = source["deployed"];
	        this.capabilities = source["capabilities"];
	        this.targets = this.convertValues(source["targets"], TargetDTO);
	        this.modTypes = this.convertValues(source["modTypes"], ModTypeDTO);
	        this.foreign = this.convertValues(source["foreign"], FindingDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ActiveGameDTO {
	    instance?: ManagedGameDTO;
	    status?: DeployStatusDTO;
	    mods?: ModsSummaryDTO;
	    conflicts?: ConflictsSummaryDTO;
	
	    static createFrom(source: any = {}) {
	        return new ActiveGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = this.convertValues(source["instance"], ManagedGameDTO);
	        this.status = this.convertValues(source["status"], DeployStatusDTO);
	        this.mods = this.convertValues(source["mods"], ModsSummaryDTO);
	        this.conflicts = this.convertValues(source["conflicts"], ConflictsSummaryDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EntryRefDTO {
	    mod?: string;
	    separator?: string;
	
	    static createFrom(source: any = {}) {
	        return new EntryRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mod = source["mod"];
	        this.separator = source["separator"];
	    }
	}
	export class AnchorDTO {
	    kind: string;
	    entry: EntryRefDTO;
	    priority?: number;
	
	    static createFrom(source: any = {}) {
	        return new AnchorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.entry = this.convertValues(source["entry"], EntryRefDTO);
	        this.priority = source["priority"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FomodSelectionDTO {
	    step: number;
	    group: number;
	    options: number[];
	
	    static createFrom(source: any = {}) {
	        return new FomodSelectionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.step = source["step"];
	        this.group = source["group"];
	        this.options = source["options"];
	    }
	}
	export class AnswerDTO {
	    choice: string;
	    mod?: string;
	    label?: string;
	    root?: string;
	    fomod?: FomodSelectionDTO[];
	    requirements?: string[];
	
	    static createFrom(source: any = {}) {
	        return new AnswerDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.choice = source["choice"];
	        this.mod = source["mod"];
	        this.label = source["label"];
	        this.root = source["root"];
	        this.fomod = this.convertValues(source["fomod"], FomodSelectionDTO);
	        this.requirements = source["requirements"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AppInfo {
	    name: string;
	    version: string;
	    dataDir: string;
	    schemaVersion: number;
	    interruptedOperations: number;
	    logsDir: string;
	    customTitleBar: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.dataDir = source["dataDir"];
	        this.schemaVersion = source["schemaVersion"];
	        this.interruptedOperations = source["interruptedOperations"];
	        this.logsDir = source["logsDir"];
	        this.customTitleBar = source["customTitleBar"];
	    }
	}
	export class ArchiveInfoDTO {
	    name: string;
	    kind: string;
	    size: number;
	    hash: string;
	    retained: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ArchiveInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.size = source["size"];
	        this.hash = source["hash"];
	        this.retained = source["retained"];
	    }
	}
	export class ArchivesPreviewDTO {
	    from: string;
	    to: string;
	    bytes: number;
	    free: number;
	    sameVolume: boolean;
	    problem?: string;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new ArchivesPreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from = source["from"];
	        this.to = source["to"];
	        this.bytes = source["bytes"];
	        this.free = source["free"];
	        this.sameVolume = source["sameVolume"];
	        this.problem = source["problem"];
	        this.reason = source["reason"];
	    }
	}
	export class DiagnosticActionDTO {
	    id: string;
	    params?: Record<string, string>;
	    target?: EntityRefDTO;
	    navigateTo?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticActionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.params = source["params"];
	        this.target = this.convertValues(source["target"], EntityRefDTO);
	        this.navigateTo = source["navigateTo"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EntityRefDTO {
	    kind: string;
	    id: string;
	
	    static createFrom(source: any = {}) {
	        return new EntityRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.id = source["id"];
	    }
	}
	export class DiagnosticEvidenceDTO {
	    kind: string;
	    ref?: EntityRefDTO;
	    params?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticEvidenceDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.ref = this.convertValues(source["ref"], EntityRefDTO);
	        this.params = source["params"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiagnosticDTO {
	    key: string;
	    code: string;
	    severity: string;
	    blocking: boolean;
	    blocks: string[];
	    module: string;
	    instance: string;
	    params: Record<string, string>;
	    evidence: DiagnosticEvidenceDTO[];
	    actions: DiagnosticActionDTO[];
	    related: EntityRefDTO[];
	    firstSeen?: string;
	    new: boolean;
	    suppressed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.code = source["code"];
	        this.severity = source["severity"];
	        this.blocking = source["blocking"];
	        this.blocks = source["blocks"];
	        this.module = source["module"];
	        this.instance = source["instance"];
	        this.params = source["params"];
	        this.evidence = this.convertValues(source["evidence"], DiagnosticEvidenceDTO);
	        this.actions = this.convertValues(source["actions"], DiagnosticActionDTO);
	        this.related = this.convertValues(source["related"], EntityRefDTO);
	        this.firstSeen = source["firstSeen"];
	        this.new = source["new"];
	        this.suppressed = source["suppressed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AttentionGroupDTO {
	    code: string;
	    severity: string;
	    blocking: boolean;
	    count: number;
	    first: DiagnosticDTO;
	
	    static createFrom(source: any = {}) {
	        return new AttentionGroupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.severity = source["severity"];
	        this.blocking = source["blocking"];
	        this.count = source["count"];
	        this.first = this.convertValues(source["first"], DiagnosticDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupDTO {
	    id: string;
	    kind: string;
	    at: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.at = source["at"];
	        this.size = source["size"];
	    }
	}
	export class BackupFailureDTO {
	    kind: string;
	    at: string;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupFailureDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.at = source["at"];
	        this.reason = source["reason"];
	    }
	}
	export class BackupStatusDTO {
	    lastAuto?: string;
	    lastManual?: string;
	    lastStartup?: string;
	    failure?: BackupFailureDTO;
	    restorePending?: string;
	    restoredAt?: string;
	    backups: BackupDTO[];
	
	    static createFrom(source: any = {}) {
	        return new BackupStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lastAuto = source["lastAuto"];
	        this.lastManual = source["lastManual"];
	        this.lastStartup = source["lastStartup"];
	        this.failure = this.convertValues(source["failure"], BackupFailureDTO);
	        this.restorePending = source["restorePending"];
	        this.restoredAt = source["restoredAt"];
	        this.backups = this.convertValues(source["backups"], BackupDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CategoryDTO {
	    id: string;
	    name: string;
	    parent?: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new CategoryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.parent = source["parent"];
	        this.order = source["order"];
	    }
	}
	export class ConflictProviderDTO {
	    id: string;
	    name: string;
	    priority: number;
	    enabled: boolean;
	    size: number;
	    hash?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConflictProviderDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.priority = source["priority"];
	        this.enabled = source["enabled"];
	        this.size = source["size"];
	        this.hash = source["hash"];
	    }
	}
	export class ConflictFileDTO {
	    location: LocationDTO;
	    providers: ConflictProviderDTO[];
	    winner: string;
	    resolution: string;
	    override?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConflictFileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.providers = this.convertValues(source["providers"], ConflictProviderDTO);
	        this.winner = source["winner"];
	        this.resolution = source["resolution"];
	        this.override = source["override"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConflictIndicatorDTO {
	    modId: string;
	    indicator: string;
	    files: number;
	    unreviewed: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictIndicatorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modId = source["modId"];
	        this.indicator = source["indicator"];
	        this.files = source["files"];
	        this.unreviewed = source["unreviewed"];
	    }
	}
	export class ConflictModDTO {
	    id: string;
	    name: string;
	    priority: number;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ConflictModDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.priority = source["priority"];
	        this.enabled = source["enabled"];
	    }
	}
	export class PairRuleDTO {
	    id: string;
	    winner: string;
	    source: string;
	    disabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PairRuleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.winner = source["winner"];
	        this.source = source["source"];
	        this.disabled = source["disabled"];
	    }
	}
	export class ConflictOpponentDTO {
	    opponent: ConflictModDTO;
	    files: number;
	    wins: number;
	    loses: number;
	    redundant: number;
	    decision: string;
	    reviewed: boolean;
	    needsReview: boolean;
	    rule?: PairRuleDTO;
	
	    static createFrom(source: any = {}) {
	        return new ConflictOpponentDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.opponent = this.convertValues(source["opponent"], ConflictModDTO);
	        this.files = source["files"];
	        this.wins = source["wins"];
	        this.loses = source["loses"];
	        this.redundant = source["redundant"];
	        this.decision = source["decision"];
	        this.reviewed = source["reviewed"];
	        this.needsReview = source["needsReview"];
	        this.rule = this.convertValues(source["rule"], PairRuleDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConflictPairDTO {
	    a: ConflictModDTO;
	    b: ConflictModDTO;
	    winner: string;
	    files: number;
	    winsA: number;
	    winsB: number;
	    redundant: number;
	    decision: string;
	    reviewed: boolean;
	    needsReview: boolean;
	    potential: boolean;
	    rule?: PairRuleDTO;
	
	    static createFrom(source: any = {}) {
	        return new ConflictPairDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.a = this.convertValues(source["a"], ConflictModDTO);
	        this.b = this.convertValues(source["b"], ConflictModDTO);
	        this.winner = source["winner"];
	        this.files = source["files"];
	        this.winsA = source["winsA"];
	        this.winsB = source["winsB"];
	        this.redundant = source["redundant"];
	        this.decision = source["decision"];
	        this.reviewed = source["reviewed"];
	        this.needsReview = source["needsReview"];
	        this.potential = source["potential"];
	        this.rule = this.convertValues(source["rule"], PairRuleDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConflictPairDetailDTO {
	    pair: ConflictPairDTO;
	    files: ConflictFileDTO[];
	    pendingHashes: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictPairDetailDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pair = this.convertValues(source["pair"], ConflictPairDTO);
	        this.files = this.convertValues(source["files"], ConflictFileDTO);
	        this.pendingHashes = source["pendingHashes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StaleIntentDTO {
	    kind: string;
	    location: LocationDTO;
	    mod: ConflictModDTO;
	    reason: string;
	    rivals: ConflictModDTO[];
	
	    static createFrom(source: any = {}) {
	        return new StaleIntentDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.mod = this.convertValues(source["mod"], ConflictModDTO);
	        this.reason = source["reason"];
	        this.rivals = this.convertValues(source["rivals"], ConflictModDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConflictTotalsDTO {
	    pairs: number;
	    unreviewed: number;
	    override: number;
	    redundant: number;
	    rule: number;
	    order: number;
	    mixed: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictTotalsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pairs = source["pairs"];
	        this.unreviewed = source["unreviewed"];
	        this.override = source["override"];
	        this.redundant = source["redundant"];
	        this.rule = source["rule"];
	        this.order = source["order"];
	        this.mixed = source["mixed"];
	    }
	}
	export class ConflictPairsDTO {
	    pairs: ConflictPairDTO[];
	    totals: ConflictTotalsDTO;
	    stale: StaleIntentDTO[];
	    pendingHashes: number;
	
	    static createFrom(source: any = {}) {
	        return new ConflictPairsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pairs = this.convertValues(source["pairs"], ConflictPairDTO);
	        this.totals = this.convertValues(source["totals"], ConflictTotalsDTO);
	        this.stale = this.convertValues(source["stale"], StaleIntentDTO);
	        this.pendingHashes = source["pendingHashes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class NamedModDTO {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new NamedModDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class CycleRuleDTO {
	    id: string;
	    winner: NamedModDTO;
	    loser: NamedModDTO;
	    source: string;
	
	    static createFrom(source: any = {}) {
	        return new CycleRuleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.winner = this.convertValues(source["winner"], NamedModDTO);
	        this.loser = this.convertValues(source["loser"], NamedModDTO);
	        this.source = source["source"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DashletDTO {
	    id: string;
	    hidden: boolean;
	    pinned: boolean;
	    visible: boolean;
	    locked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DashletDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.hidden = source["hidden"];
	        this.pinned = source["pinned"];
	        this.visible = source["visible"];
	        this.locked = source["locked"];
	    }
	}
	export class FomodWarningDTO {
	    code: string;
	    params: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new FomodWarningDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.params = source["params"];
	    }
	}
	export class FomodDecisionDTO {
	    module: string;
	    hasImage: boolean;
	    previous: FomodSelectionDTO[];
	    warnings: FomodWarningDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FomodDecisionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.module = source["module"];
	        this.hasImage = source["hasImage"];
	        this.previous = this.convertValues(source["previous"], FomodSelectionDTO);
	        this.warnings = this.convertValues(source["warnings"], FomodWarningDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DuplicateModDTO {
	    id: string;
	    name: string;
	    version: string;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateModDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.version = source["version"];
	    }
	}
	export class DecisionDTO {
	    kind: string;
	    choices: string[];
	    duplicates: DuplicateModDTO[];
	    suggestedLabel?: string;
	    candidates: string[];
	    folders: string[];
	    ratio?: number;
	    fomod?: FomodDecisionDTO;
	
	    static createFrom(source: any = {}) {
	        return new DecisionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.choices = source["choices"];
	        this.duplicates = this.convertValues(source["duplicates"], DuplicateModDTO);
	        this.suggestedLabel = source["suggestedLabel"];
	        this.candidates = source["candidates"];
	        this.folders = source["folders"];
	        this.ratio = source["ratio"];
	        this.fomod = this.convertValues(source["fomod"], FomodDecisionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DeployBlockedDTO {
	    location: LocationDTO;
	    reason: string;
	
	    static createFrom(source: any = {}) {
	        return new DeployBlockedDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.reason = source["reason"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FileFactsDTO {
	    size: number;
	    modTime?: string;
	
	    static createFrom(source: any = {}) {
	        return new FileFactsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	    }
	}
	export class DeployChangeDTO {
	    location: LocationDTO;
	    kind: string;
	    mod?: string;
	    modName?: string;
	    method?: string;
	    wanted: boolean;
	    actions: string[];
	    suggested?: string;
	    before?: FileFactsDTO;
	    after?: FileFactsDTO;
	
	    static createFrom(source: any = {}) {
	        return new DeployChangeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.kind = source["kind"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	        this.method = source["method"];
	        this.wanted = source["wanted"];
	        this.actions = source["actions"];
	        this.suggested = source["suggested"];
	        this.before = this.convertValues(source["before"], FileFactsDTO);
	        this.after = this.convertValues(source["after"], FileFactsDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class DeployFallbackDTO {
	    key: string;
	    target: string;
	    from: string;
	    to: string;
	    count: number;
	    sample: LocationDTO[];
	
	    static createFrom(source: any = {}) {
	        return new DeployFallbackDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.target = source["target"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.count = source["count"];
	        this.sample = this.convertValues(source["sample"], LocationDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DeployMethodDTO {
	    method: string;
	    available: boolean;
	    reason?: string;
	    preferred: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeployMethodDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.available = source["available"];
	        this.reason = source["reason"];
	        this.preferred = source["preferred"];
	    }
	}
	export class DeploySummaryDTO {
	    create: number;
	    keep: number;
	    replace: number;
	    remove: number;
	    backupAndCreate: number;
	    restoreBackup: number;
	    mkdir: number;
	    removeDir: number;
	    extraBytes: number;
	    decisions: number;
	
	    static createFrom(source: any = {}) {
	        return new DeploySummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.create = source["create"];
	        this.keep = source["keep"];
	        this.replace = source["replace"];
	        this.remove = source["remove"];
	        this.backupAndCreate = source["backupAndCreate"];
	        this.restoreBackup = source["restoreBackup"];
	        this.mkdir = source["mkdir"];
	        this.removeDir = source["removeDir"];
	        this.extraBytes = source["extraBytes"];
	        this.decisions = source["decisions"];
	    }
	}
	export class DeployPlanDTO {
	    instance: string;
	    operation?: string;
	    kind: string;
	    summary: DeploySummaryDTO;
	    changes: DeployChangeDTO[];
	    blocked: DeployBlockedDTO[];
	    fallbacks: DeployFallbackDTO[];
	    changeCount: number;
	    blockedCount: number;
	    newFileCount: number;
	    empty: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeployPlanDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.operation = source["operation"];
	        this.kind = source["kind"];
	        this.summary = this.convertValues(source["summary"], DeploySummaryDTO);
	        this.changes = this.convertValues(source["changes"], DeployChangeDTO);
	        this.blocked = this.convertValues(source["blocked"], DeployBlockedDTO);
	        this.fallbacks = this.convertValues(source["fallbacks"], DeployFallbackDTO);
	        this.changeCount = source["changeCount"];
	        this.blockedCount = source["blockedCount"];
	        this.newFileCount = source["newFileCount"];
	        this.empty = source["empty"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class DiagnosticActionResultDTO {
	    operations: string[];
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticActionResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.operations = source["operations"];
	    }
	}
	export class DiagnosticCountsDTO {
	    blocking: number;
	    errors: number;
	    warnings: number;
	    infos: number;
	
	    static createFrom(source: any = {}) {
	        return new DiagnosticCountsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blocking = source["blocking"];
	        this.errors = source["errors"];
	        this.warnings = source["warnings"];
	        this.infos = source["infos"];
	    }
	}
	
	
	export class DisabledPluginDTO {
	    name: string;
	    mod: string;
	    modName: string;
	    losing: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DisabledPluginDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	        this.losing = source["losing"];
	    }
	}
	export class DiscoveredGameDTO {
	    gameId: string;
	    gameName: string;
	    root: string;
	    store: string;
	    version?: string;
	    hidden: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DiscoveredGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gameId = source["gameId"];
	        this.gameName = source["gameName"];
	        this.root = source["root"];
	        this.store = source["store"];
	        this.version = source["version"];
	        this.hidden = source["hidden"];
	    }
	}
	
	export class EnableImpactDTO {
	    alsoEnable: NamedModDTO[];
	    affected: NamedModDTO[];
	
	    static createFrom(source: any = {}) {
	        return new EnableImpactDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alsoEnable = this.convertValues(source["alsoEnable"], NamedModDTO);
	        this.affected = this.convertValues(source["affected"], NamedModDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class ErrorDTO {
	    code: string;
	    message: string;
	    step?: string;
	    detail?: string;
	    retryable: boolean;
	    params?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ErrorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.message = source["message"];
	        this.step = source["step"];
	        this.detail = source["detail"];
	        this.retryable = source["retryable"];
	        this.params = source["params"];
	    }
	}
	export class ProgressDTO {
	    current: number;
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new ProgressDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.total = source["total"];
	    }
	}
	export class EventDTO {
	    id: string;
	    sequence: number;
	    type: string;
	    occurredAt: string;
	    operationId?: string;
	    subject?: EntityRefDTO;
	    status?: string;
	    step?: string;
	    progress?: ProgressDTO;
	    error?: ErrorDTO;
	    data?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new EventDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sequence = source["sequence"];
	        this.type = source["type"];
	        this.occurredAt = source["occurredAt"];
	        this.operationId = source["operationId"];
	        this.subject = this.convertValues(source["subject"], EntityRefDTO);
	        this.status = source["status"];
	        this.step = source["step"];
	        this.progress = this.convertValues(source["progress"], ProgressDTO);
	        this.error = this.convertValues(source["error"], ErrorDTO);
	        this.data = source["data"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExtensionGameDTO {
	    id: string;
	    name: string;
	    capabilities: string[];
	    custom: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExtensionGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.capabilities = source["capabilities"];
	        this.custom = source["custom"];
	    }
	}
	export class ExtensionDTO {
	    name: string;
	    version: string;
	    games: ExtensionGameDTO[];
	    capabilities: string[];
	    builtIn: boolean;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExtensionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.games = this.convertValues(source["games"], ExtensionGameDTO);
	        this.capabilities = source["capabilities"];
	        this.builtIn = source["builtIn"];
	        this.active = source["active"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ExternalChangesDTO {
	    instance: string;
	    changes: DeployChangeDTO[];
	    changeCount: number;
	    newFileCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ExternalChangesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.changes = this.convertValues(source["changes"], DeployChangeDTO);
	        this.changeCount = source["changeCount"];
	        this.newFileCount = source["newFileCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ExternalDecisionDTO {
	    location: LocationDTO;
	    action: string;
	    captureInto?: string;
	    captureName?: string;
	    captureCategory?: string;
	
	    static createFrom(source: any = {}) {
	        return new ExternalDecisionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.action = source["action"];
	        this.captureInto = source["captureInto"];
	        this.captureName = source["captureName"];
	        this.captureCategory = source["captureCategory"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class FirstStepDTO {
	    id: string;
	    done: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FirstStepDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.done = source["done"];
	    }
	}
	export class FirstStepsDTO {
	    steps: FirstStepDTO[];
	    complete: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FirstStepsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.steps = this.convertValues(source["steps"], FirstStepDTO);
	        this.complete = source["complete"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FoldersDTO {
	    staging: string;
	    archiveStore: string;
	    backupStore: string;
	    suggestedStaging?: string;
	
	    static createFrom(source: any = {}) {
	        return new FoldersDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.staging = source["staging"];
	        this.archiveStore = source["archiveStore"];
	        this.backupStore = source["backupStore"];
	        this.suggestedStaging = source["suggestedStaging"];
	    }
	}
	
	export class FomodFolderDTO {
	    folder: string;
	    files: number;
	
	    static createFrom(source: any = {}) {
	        return new FomodFolderDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folder = source["folder"];
	        this.files = source["files"];
	    }
	}
	export class FomodOptionDTO {
	    index: number;
	    name: string;
	    description: string;
	    image?: string;
	    type: string;
	    selected: boolean;
	    locked: boolean;
	    disabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FomodOptionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.image = source["image"];
	        this.type = source["type"];
	        this.selected = source["selected"];
	        this.locked = source["locked"];
	        this.disabled = source["disabled"];
	    }
	}
	export class FomodGroupDTO {
	    index: number;
	    name: string;
	    type: string;
	    options: FomodOptionDTO[];
	    problem?: string;
	
	    static createFrom(source: any = {}) {
	        return new FomodGroupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.options = this.convertValues(source["options"], FomodOptionDTO);
	        this.problem = source["problem"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class FomodRequirementDTO {
	    file: string;
	    mod?: string;
	    modName?: string;
	
	    static createFrom(source: any = {}) {
	        return new FomodRequirementDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	    }
	}
	
	export class FomodStepDTO {
	    index: number;
	    name: string;
	    visible: boolean;
	    groups: FomodGroupDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FomodStepDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.index = source["index"];
	        this.name = source["name"];
	        this.visible = source["visible"];
	        this.groups = this.convertValues(source["groups"], FomodGroupDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FomodSummaryDTO {
	    files: number;
	    size: number;
	    folders: FomodFolderDTO[];
	    warnings: FomodWarningDTO[];
	    requirements: FomodRequirementDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FomodSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.size = source["size"];
	        this.folders = this.convertValues(source["folders"], FomodFolderDTO);
	        this.warnings = this.convertValues(source["warnings"], FomodWarningDTO);
	        this.requirements = this.convertValues(source["requirements"], FomodRequirementDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FomodViewDTO {
	    steps: FomodStepDTO[];
	    selection: FomodSelectionDTO[];
	    problems: FomodSelectionDTO[];
	    summary?: FomodSummaryDTO;
	    planError?: string;
	
	    static createFrom(source: any = {}) {
	        return new FomodViewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.steps = this.convertValues(source["steps"], FomodStepDTO);
	        this.selection = this.convertValues(source["selection"], FomodSelectionDTO);
	        this.problems = this.convertValues(source["problems"], FomodSelectionDTO);
	        this.summary = this.convertValues(source["summary"], FomodSummaryDTO);
	        this.planError = source["planError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SupportedGameDTO {
	    gameId: string;
	    gameName: string;
	    hidden: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SupportedGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gameId = source["gameId"];
	        this.gameName = source["gameName"];
	        this.hidden = source["hidden"];
	    }
	}
	export class GamesViewDTO {
	    managed: ManagedGameDTO[];
	    discovered: DiscoveredGameDTO[];
	    supported: SupportedGameDTO[];
	    scanned: boolean;
	    hiddenCount: number;
	
	    static createFrom(source: any = {}) {
	        return new GamesViewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.managed = this.convertValues(source["managed"], ManagedGameDTO);
	        this.discovered = this.convertValues(source["discovered"], DiscoveredGameDTO);
	        this.supported = this.convertValues(source["supported"], SupportedGameDTO);
	        this.scanned = source["scanned"];
	        this.hiddenCount = source["hiddenCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HistoryEntryDTO {
	    id: string;
	    sequence: number;
	    type: string;
	    at: string;
	    origin: string;
	    subject?: EntityRefDTO;
	    operation?: string;
	    params: Record<string, string>;
	    items: number;
	    reversible: boolean;
	    revertedBy?: string;
	    revertOf?: string;
	
	    static createFrom(source: any = {}) {
	        return new HistoryEntryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sequence = source["sequence"];
	        this.type = source["type"];
	        this.at = source["at"];
	        this.origin = source["origin"];
	        this.subject = this.convertValues(source["subject"], EntityRefDTO);
	        this.operation = source["operation"];
	        this.params = source["params"];
	        this.items = source["items"];
	        this.reversible = source["reversible"];
	        this.revertedBy = source["revertedBy"];
	        this.revertOf = source["revertOf"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class HistoryFilterDTO {
	    instance: string;
	    profile: string;
	    mod: string;
	    types: string[];
	    origin: string;
	    from: string;
	    to: string;
	    before: number;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new HistoryFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.profile = source["profile"];
	        this.mod = source["mod"];
	        this.types = source["types"];
	        this.origin = source["origin"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.before = source["before"];
	        this.limit = source["limit"];
	    }
	}
	export class InstallationInfoDTO {
	    id: string;
	    installer: string;
	    options: Record<string, string>;
	    files: number;
	    size: number;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new InstallationInfoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.installer = source["installer"];
	        this.options = source["options"];
	        this.files = source["files"];
	        this.size = source["size"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class LimitDTO {
	    kind: string;
	    used: number;
	    max: number;
	
	    static createFrom(source: any = {}) {
	        return new LimitDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.used = source["used"];
	        this.max = source["max"];
	    }
	}
	export class PluginsSummaryDTO {
	    active: number;
	    limits: LimitDTO[];
	
	    static createFrom(source: any = {}) {
	        return new PluginsSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.limits = this.convertValues(source["limits"], LimitDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InstanceOverviewDTO {
	    instance: ManagedGameDTO;
	    status?: DeployStatusDTO;
	    attention: AttentionGroupDTO[];
	    attentionPartial: boolean;
	    mods?: ModsSummaryDTO;
	    plugins?: PluginsSummaryDTO;
	    conflicts?: ConflictsSummaryDTO;
	    recent: HistoryEntryDTO[];
	
	    static createFrom(source: any = {}) {
	        return new InstanceOverviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = this.convertValues(source["instance"], ManagedGameDTO);
	        this.status = this.convertValues(source["status"], DeployStatusDTO);
	        this.attention = this.convertValues(source["attention"], AttentionGroupDTO);
	        this.attentionPartial = source["attentionPartial"];
	        this.mods = this.convertValues(source["mods"], ModsSummaryDTO);
	        this.plugins = this.convertValues(source["plugins"], PluginsSummaryDTO);
	        this.conflicts = this.convertValues(source["conflicts"], ConflictsSummaryDTO);
	        this.recent = this.convertValues(source["recent"], HistoryEntryDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class InstanceRefDTO {
	    id: string;
	    name: string;
	    gameName: string;
	
	    static createFrom(source: any = {}) {
	        return new InstanceRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.gameName = source["gameName"];
	    }
	}
	export class LaunchOptionDTO {
	    id: string;
	    exe: string;
	    default: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LaunchOptionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.exe = source["exe"];
	        this.default = source["default"];
	    }
	}
	export class LaunchCheckDTO {
	    instance: string;
	    state: string;
	    options: LaunchOptionDTO[];
	    deployKind: string;
	    deployReason: string;
	    deployNeeded: boolean;
	    autoDeploy: boolean;
	    deployProblem: boolean;
	    busy?: string;
	    running: string[];
	    blocking: DiagnosticDTO[];
	    warnings: DiagnosticDTO[];
	    unavailable?: string;
	
	    static createFrom(source: any = {}) {
	        return new LaunchCheckDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.state = source["state"];
	        this.options = this.convertValues(source["options"], LaunchOptionDTO);
	        this.deployKind = source["deployKind"];
	        this.deployReason = source["deployReason"];
	        this.deployNeeded = source["deployNeeded"];
	        this.autoDeploy = source["autoDeploy"];
	        this.deployProblem = source["deployProblem"];
	        this.busy = source["busy"];
	        this.running = source["running"];
	        this.blocking = this.convertValues(source["blocking"], DiagnosticDTO);
	        this.warnings = this.convertValues(source["warnings"], DiagnosticDTO);
	        this.unavailable = source["unavailable"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LaunchRequestDTO {
	    option: string;
	    deploy: boolean;
	    confirmed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LaunchRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.option = source["option"];
	        this.deploy = source["deploy"];
	        this.confirmed = source["confirmed"];
	    }
	}
	
	export class LoadOrderLineDTO {
	    name: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoadOrderLineDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.enabled = source["enabled"];
	    }
	}
	export class LoadOrderDiffDTO {
	    desired: LoadOrderLineDTO[];
	    applied: LoadOrderLineDTO[];
	    exists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoadOrderDiffDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.desired = this.convertValues(source["desired"], LoadOrderLineDTO);
	        this.applied = this.convertValues(source["applied"], LoadOrderLineDTO);
	        this.exists = source["exists"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LoadOrderStateDTO {
	    supported: boolean;
	    applied: boolean;
	    differences: number;
	    external: boolean;
	    fileExists: boolean;
	    unreadable: boolean;
	    canRestorePrevious: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoadOrderStateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.supported = source["supported"];
	        this.applied = source["applied"];
	        this.differences = source["differences"];
	        this.external = source["external"];
	        this.fileExists = source["fileExists"];
	        this.unreadable = source["unreadable"];
	        this.canRestorePrevious = source["canRestorePrevious"];
	    }
	}
	export class PluginLimitDTO {
	    kind: string;
	    used: number;
	    max: number;
	
	    static createFrom(source: any = {}) {
	        return new PluginLimitDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.used = source["used"];
	        this.max = source["max"];
	    }
	}
	export class PluginRowDTO {
	    name: string;
	    enabled: boolean;
	    implicit: boolean;
	    locked: boolean;
	    position: number;
	    index: string;
	    origin: string;
	    mod: string;
	    modName: string;
	    flags: string[];
	    group: string;
	    masters: number;
	    problems: number;
	    problem: string;
	    severity: string;
	    author: string;
	    version: string;
	    description: string;
	    rules: number;
	
	    static createFrom(source: any = {}) {
	        return new PluginRowDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.enabled = source["enabled"];
	        this.implicit = source["implicit"];
	        this.locked = source["locked"];
	        this.position = source["position"];
	        this.index = source["index"];
	        this.origin = source["origin"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	        this.flags = source["flags"];
	        this.group = source["group"];
	        this.masters = source["masters"];
	        this.problems = source["problems"];
	        this.problem = source["problem"];
	        this.severity = source["severity"];
	        this.author = source["author"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.rules = source["rules"];
	    }
	}
	export class LoadOrderViewDTO {
	    rows: PluginRowDTO[];
	    limits: PluginLimitDTO[];
	    active: number;
	    errors: number;
	    autoSort: boolean;
	    disabled: DisabledPluginDTO[];
	    external: boolean;
	    cycle: string[];
	    manualOrder: boolean;
	    hasLoadOrder: boolean;
	    state: LoadOrderStateDTO;
	    canUndoSort: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LoadOrderViewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rows = this.convertValues(source["rows"], PluginRowDTO);
	        this.limits = this.convertValues(source["limits"], PluginLimitDTO);
	        this.active = source["active"];
	        this.errors = source["errors"];
	        this.autoSort = source["autoSort"];
	        this.disabled = this.convertValues(source["disabled"], DisabledPluginDTO);
	        this.external = source["external"];
	        this.cycle = source["cycle"];
	        this.manualOrder = source["manualOrder"];
	        this.hasLoadOrder = source["hasLoadOrder"];
	        this.state = this.convertValues(source["state"], LoadOrderStateDTO);
	        this.canUndoSort = source["canUndoSort"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LogEntryDTO {
	    time: string;
	    level: string;
	    message: string;
	    operation?: string;
	    step?: string;
	    error?: string;
	    fields?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new LogEntryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.level = source["level"];
	        this.message = source["message"];
	        this.operation = source["operation"];
	        this.step = source["step"];
	        this.error = source["error"];
	        this.fields = source["fields"];
	    }
	}
	export class LogFilterDTO {
	    levels: string[];
	    operation: string;
	    text: string;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new LogFilterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.levels = source["levels"];
	        this.operation = source["operation"];
	        this.text = source["text"];
	        this.limit = source["limit"];
	    }
	}
	export class ManageResultDTO {
	    instanceId: string;
	    operationId: string;
	
	    static createFrom(source: any = {}) {
	        return new ManageResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instanceId = source["instanceId"];
	        this.operationId = source["operationId"];
	    }
	}
	
	export class MethodStatusDTO {
	    method: string;
	    available: boolean;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new MethodStatusDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.method = source["method"];
	        this.available = source["available"];
	        this.reason = source["reason"];
	    }
	}
	export class ModAttributesDTO {
	    name: string;
	    version: string;
	    author: string;
	    notes: string;
	    highlight: string;
	    tags: string[];
	
	    static createFrom(source: any = {}) {
	        return new ModAttributesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.version = source["version"];
	        this.author = source["author"];
	        this.notes = source["notes"];
	        this.highlight = source["highlight"];
	        this.tags = source["tags"];
	    }
	}
	export class ModConflictFileDTO {
	    location: LocationDTO;
	    size: number;
	    state: string;
	    winner?: ConflictModDTO;
	    opponents: ConflictModDTO[];
	    overridden: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ModConflictFileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.location = this.convertValues(source["location"], LocationDTO);
	        this.size = source["size"];
	        this.state = source["state"];
	        this.winner = this.convertValues(source["winner"], ConflictModDTO);
	        this.opponents = this.convertValues(source["opponents"], ConflictModDTO);
	        this.overridden = source["overridden"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModConflictFilesDTO {
	    total: number;
	    files: ModConflictFileDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ModConflictFilesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.files = this.convertValues(source["files"], ModConflictFileDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModConflictsDTO {
	    mod: ConflictModDTO;
	    indicator: string;
	    opponents: ConflictOpponentDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ModConflictsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mod = this.convertValues(source["mod"], ConflictModDTO);
	        this.indicator = source["indicator"];
	        this.opponents = this.convertValues(source["opponents"], ConflictOpponentDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModDetailsDTO {
	    id: string;
	    name: string;
	    detectedName: string;
	    version: string;
	    author: string;
	    category: string;
	    categoryPath: string[];
	    state: string;
	    enabled: boolean;
	    enabledAt?: string;
	    size: number;
	    files: number;
	    type: string;
	    typeName: string;
	    content: string[];
	    installer: string;
	    source: string;
	    installedAt?: string;
	    variantOf?: string;
	    variantLabel?: string;
	    highlight?: string;
	    hasNotes: boolean;
	    queued: boolean;
	    description: string;
	    notes: string;
	    tags: string[];
	    variantOfName?: string;
	    archive?: ArchiveInfoDTO;
	    installation?: InstallationInfoDTO;
	    modTypes: ModTypeDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ModDetailsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.detectedName = source["detectedName"];
	        this.version = source["version"];
	        this.author = source["author"];
	        this.category = source["category"];
	        this.categoryPath = source["categoryPath"];
	        this.state = source["state"];
	        this.enabled = source["enabled"];
	        this.enabledAt = source["enabledAt"];
	        this.size = source["size"];
	        this.files = source["files"];
	        this.type = source["type"];
	        this.typeName = source["typeName"];
	        this.content = source["content"];
	        this.installer = source["installer"];
	        this.source = source["source"];
	        this.installedAt = source["installedAt"];
	        this.variantOf = source["variantOf"];
	        this.variantLabel = source["variantLabel"];
	        this.highlight = source["highlight"];
	        this.hasNotes = source["hasNotes"];
	        this.queued = source["queued"];
	        this.description = source["description"];
	        this.notes = source["notes"];
	        this.tags = source["tags"];
	        this.variantOfName = source["variantOfName"];
	        this.archive = this.convertValues(source["archive"], ArchiveInfoDTO);
	        this.installation = this.convertValues(source["installation"], InstallationInfoDTO);
	        this.modTypes = this.convertValues(source["modTypes"], ModTypeDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModFileDTO {
	    path: string;
	    target: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new ModFileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.target = source["target"];
	        this.size = source["size"];
	    }
	}
	export class ModFilesDTO {
	    total: number;
	    files: ModFileDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ModFilesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.files = this.convertValues(source["files"], ModFileDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModHistoryDTO {
	    id: string;
	    type: string;
	    occurredAt: string;
	    operationId?: string;
	    params: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ModHistoryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.occurredAt = source["occurredAt"];
	        this.operationId = source["operationId"];
	        this.params = source["params"];
	    }
	}
	export class ModMoveDTO {
	    id: string;
	    name: string;
	    from: number;
	    to: number;
	    because: string[];
	
	    static createFrom(source: any = {}) {
	        return new ModMoveDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.because = source["because"];
	    }
	}
	export class SeparatorDTO {
	    id: string;
	    label: string;
	    color?: string;
	    collapsed: boolean;
	    enabled: number;
	    total: number;
	
	    static createFrom(source: any = {}) {
	        return new SeparatorDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.color = source["color"];
	        this.collapsed = source["collapsed"];
	        this.enabled = source["enabled"];
	        this.total = source["total"];
	    }
	}
	export class OrderEntryDTO {
	    kind: string;
	    modId?: string;
	    priority?: number;
	    separator?: SeparatorDTO;
	
	    static createFrom(source: any = {}) {
	        return new OrderEntryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.modId = source["modId"];
	        this.priority = source["priority"];
	        this.separator = this.convertValues(source["separator"], SeparatorDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModOrderDTO {
	    profileId: string;
	    profileName: string;
	    entries: OrderEntryDTO[];
	    undo?: string;
	
	    static createFrom(source: any = {}) {
	        return new ModOrderDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.profileName = source["profileName"];
	        this.entries = this.convertValues(source["entries"], OrderEntryDTO);
	        this.undo = source["undo"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModRowDTO {
	    id: string;
	    name: string;
	    detectedName: string;
	    version: string;
	    author: string;
	    category: string;
	    categoryPath: string[];
	    state: string;
	    enabled: boolean;
	    enabledAt?: string;
	    size: number;
	    files: number;
	    type: string;
	    typeName: string;
	    content: string[];
	    installer: string;
	    source: string;
	    installedAt?: string;
	    variantOf?: string;
	    variantLabel?: string;
	    highlight?: string;
	    hasNotes: boolean;
	    queued: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ModRowDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.detectedName = source["detectedName"];
	        this.version = source["version"];
	        this.author = source["author"];
	        this.category = source["category"];
	        this.categoryPath = source["categoryPath"];
	        this.state = source["state"];
	        this.enabled = source["enabled"];
	        this.enabledAt = source["enabledAt"];
	        this.size = source["size"];
	        this.files = source["files"];
	        this.type = source["type"];
	        this.typeName = source["typeName"];
	        this.content = source["content"];
	        this.installer = source["installer"];
	        this.source = source["source"];
	        this.installedAt = source["installedAt"];
	        this.variantOf = source["variantOf"];
	        this.variantLabel = source["variantLabel"];
	        this.highlight = source["highlight"];
	        this.hasNotes = source["hasNotes"];
	        this.queued = source["queued"];
	    }
	}
	
	
	export class MoveRequestDTO {
	    entries: EntryRefDTO[];
	    anchor: AnchorDTO;
	    mode: string;
	
	    static createFrom(source: any = {}) {
	        return new MoveRequestDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entries = this.convertValues(source["entries"], EntryRefDTO);
	        this.anchor = this.convertValues(source["anchor"], AnchorDTO);
	        this.mode = source["mode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RuleDTO {
	    id: string;
	    kind: string;
	    a: NamedModDTO;
	    b: NamedModDTO;
	    source: string;
	    disabled: boolean;
	    orphan: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RuleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.a = this.convertValues(source["a"], NamedModDTO);
	        this.b = this.convertValues(source["b"], NamedModDTO);
	        this.source = source["source"];
	        this.disabled = source["disabled"];
	        this.orphan = source["orphan"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MoveResultDTO {
	    applied: boolean;
	    violated: RuleDTO[];
	    hasNearest: boolean;
	    nearestPriority?: number;
	
	    static createFrom(source: any = {}) {
	        return new MoveResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.applied = source["applied"];
	        this.violated = this.convertValues(source["violated"], RuleDTO);
	        this.hasNearest = source["hasNearest"];
	        this.nearestPriority = source["nearestPriority"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class NotificationDTO {
	    id: string;
	    kind: string;
	    code: string;
	    params: Record<string, string>;
	    subject?: EntityRefDTO;
	    instance?: string;
	    severity: string;
	    count: number;
	    state: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new NotificationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.code = source["code"];
	        this.params = source["params"];
	        this.subject = this.convertValues(source["subject"], EntityRefDTO);
	        this.instance = source["instance"];
	        this.severity = source["severity"];
	        this.count = source["count"];
	        this.state = source["state"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StepDTO {
	    name: string;
	    status: string;
	    startedAt?: string;
	    finishedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new StepDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	    }
	}
	export class OperationDTO {
	    id: string;
	    kind: string;
	    status: string;
	    subject?: EntityRefDTO;
	    steps: StepDTO[];
	    currentStep?: string;
	    progress: ProgressDTO;
	    error?: ErrorDTO;
	    createdAt: string;
	    startedAt?: string;
	    finishedAt?: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new OperationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.status = source["status"];
	        this.subject = this.convertValues(source["subject"], EntityRefDTO);
	        this.steps = this.convertValues(source["steps"], StepDTO);
	        this.currentStep = source["currentStep"];
	        this.progress = this.convertValues(source["progress"], ProgressDTO);
	        this.error = this.convertValues(source["error"], ErrorDTO);
	        this.createdAt = source["createdAt"];
	        this.startedAt = source["startedAt"];
	        this.finishedAt = source["finishedAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OrderChangeDTO {
	    id: string;
	    at: string;
	    reason: string;
	    moved: number;
	    revertOf?: string;
	    reverted: boolean;
	    revertible: boolean;
	
	    static createFrom(source: any = {}) {
	        return new OrderChangeDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.at = source["at"];
	        this.reason = source["reason"];
	        this.moved = source["moved"];
	        this.revertOf = source["revertOf"];
	        this.reverted = source["reverted"];
	        this.revertible = source["revertible"];
	    }
	}
	
	export class PairDecisionDTO {
	    mod: string;
	    opponent: string;
	    choice: string;
	
	    static createFrom(source: any = {}) {
	        return new PairDecisionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mod = source["mod"];
	        this.opponent = source["opponent"];
	        this.choice = source["choice"];
	    }
	}
	export class PairRefDTO {
	    a: string;
	    b: string;
	
	    static createFrom(source: any = {}) {
	        return new PairRefDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.a = source["a"];
	        this.b = source["b"];
	    }
	}
	
	export class PluginRuleDTO {
	    id: string;
	    plugin: string;
	    after: string;
	    source: string;
	    disabled: boolean;
	    orphan: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginRuleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.plugin = source["plugin"];
	        this.after = source["after"];
	        this.source = source["source"];
	        this.disabled = source["disabled"];
	        this.orphan = source["orphan"];
	    }
	}
	export class PluginMasterDTO {
	    name: string;
	    present: boolean;
	    active: boolean;
	    before: boolean;
	    mod: string;
	    modName: string;
	    disabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginMasterDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.present = source["present"];
	        this.active = source["active"];
	        this.before = source["before"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	        this.disabled = source["disabled"];
	    }
	}
	export class PluginDetailsDTO {
	    name: string;
	    enabled: boolean;
	    implicit: boolean;
	    locked: boolean;
	    position: number;
	    index: string;
	    origin: string;
	    mod: string;
	    modName: string;
	    flags: string[];
	    group: string;
	    masters: number;
	    problems: number;
	    problem: string;
	    severity: string;
	    author: string;
	    version: string;
	    description: string;
	    rules: number;
	    path: string;
	    headerError: string;
	    mastersList: PluginMasterDTO[];
	    dependents: string[];
	    ruleList: PluginRuleDTO[];
	    diagnostics: DiagnosticDTO[];
	
	    static createFrom(source: any = {}) {
	        return new PluginDetailsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.enabled = source["enabled"];
	        this.implicit = source["implicit"];
	        this.locked = source["locked"];
	        this.position = source["position"];
	        this.index = source["index"];
	        this.origin = source["origin"];
	        this.mod = source["mod"];
	        this.modName = source["modName"];
	        this.flags = source["flags"];
	        this.group = source["group"];
	        this.masters = source["masters"];
	        this.problems = source["problems"];
	        this.problem = source["problem"];
	        this.severity = source["severity"];
	        this.author = source["author"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.rules = source["rules"];
	        this.path = source["path"];
	        this.headerError = source["headerError"];
	        this.mastersList = this.convertValues(source["mastersList"], PluginMasterDTO);
	        this.dependents = source["dependents"];
	        this.ruleList = this.convertValues(source["ruleList"], PluginRuleDTO);
	        this.diagnostics = this.convertValues(source["diagnostics"], DiagnosticDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PluginDiffDTO {
	    plugin: string;
	    a: number;
	    b: number;
	
	    static createFrom(source: any = {}) {
	        return new PluginDiffDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugin = source["plugin"];
	        this.a = source["a"];
	        this.b = source["b"];
	    }
	}
	export class PluginReasonDTO {
	    kind: string;
	    rule: string;
	    group: string;
	    afterGroup: string;
	    other: string;
	    before: boolean;
	    plugin: string;
	
	    static createFrom(source: any = {}) {
	        return new PluginReasonDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.rule = source["rule"];
	        this.group = source["group"];
	        this.afterGroup = source["afterGroup"];
	        this.other = source["other"];
	        this.before = source["before"];
	        this.plugin = source["plugin"];
	    }
	}
	export class PluginExplainDTO {
	    plugin: string;
	    position: number;
	    fixed: boolean;
	    locked: boolean;
	    group: string;
	    after: PluginReasonDTO[];
	    dependents: PluginReasonDTO[];
	
	    static createFrom(source: any = {}) {
	        return new PluginExplainDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugin = source["plugin"];
	        this.position = source["position"];
	        this.fixed = source["fixed"];
	        this.locked = source["locked"];
	        this.group = source["group"];
	        this.after = this.convertValues(source["after"], PluginReasonDTO);
	        this.dependents = this.convertValues(source["dependents"], PluginReasonDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PluginGroupDTO {
	    name: string;
	    after: string[];
	    plugins: string[];
	    default: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginGroupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.after = source["after"];
	        this.plugins = source["plugins"];
	        this.default = source["default"];
	    }
	}
	
	export class PluginListDTO {
	    rows: PluginRowDTO[];
	    limits: PluginLimitDTO[];
	    active: number;
	    errors: number;
	    autoSort: boolean;
	    disabled: DisabledPluginDTO[];
	    external: boolean;
	    cycle: string[];
	    manualOrder: boolean;
	    hasLoadOrder: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PluginListDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rows = this.convertValues(source["rows"], PluginRowDTO);
	        this.limits = this.convertValues(source["limits"], PluginLimitDTO);
	        this.active = source["active"];
	        this.errors = source["errors"];
	        this.autoSort = source["autoSort"];
	        this.disabled = this.convertValues(source["disabled"], DisabledPluginDTO);
	        this.external = source["external"];
	        this.cycle = source["cycle"];
	        this.manualOrder = source["manualOrder"];
	        this.hasLoadOrder = source["hasLoadOrder"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PluginMoveDTO {
	    plugin: string;
	    from: number;
	    to: number;
	    because: PluginReasonDTO[];
	
	    static createFrom(source: any = {}) {
	        return new PluginMoveDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.plugin = source["plugin"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.because = this.convertValues(source["because"], PluginReasonDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PluginMoveResultDTO {
	    applied: boolean;
	    violated: PluginReasonDTO[];
	    nearest: number;
	
	    static createFrom(source: any = {}) {
	        return new PluginMoveResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.applied = source["applied"];
	        this.violated = this.convertValues(source["violated"], PluginReasonDTO);
	        this.nearest = source["nearest"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class PluginRulesDTO {
	    rules: PluginRuleDTO[];
	    groups: PluginGroupDTO[];
	    plugins: string[];
	
	    static createFrom(source: any = {}) {
	        return new PluginRulesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rules = this.convertValues(source["rules"], PluginRuleDTO);
	        this.groups = this.convertValues(source["groups"], PluginGroupDTO);
	        this.plugins = source["plugins"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class PriorityDiffDTO {
	    id: string;
	    name: string;
	    a: number;
	    b: number;
	
	    static createFrom(source: any = {}) {
	        return new PriorityDiffDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.a = source["a"];
	        this.b = source["b"];
	    }
	}
	export class ProblemDTO {
	    code: string;
	    params?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ProblemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.params = source["params"];
	    }
	}
	export class ProblemsDTO {
	    instance: string;
	    name?: string;
	    items: DiagnosticDTO[];
	    suppressed: DiagnosticDTO[];
	    counts: DiagnosticCountsDTO;
	    partial: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProblemsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = source["instance"];
	        this.name = source["name"];
	        this.items = this.convertValues(source["items"], DiagnosticDTO);
	        this.suppressed = this.convertValues(source["suppressed"], DiagnosticDTO);
	        this.counts = this.convertValues(source["counts"], DiagnosticCountsDTO);
	        this.partial = source["partial"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileSummaryDTO {
	    id: string;
	    name: string;
	    notes: string;
	    active: boolean;
	    enabled: number;
	    mods: number;
	    snapshots: number;
	    createdAt: string;
	    updatedAt: string;
	    lastActivatedAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProfileSummaryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.notes = source["notes"];
	        this.active = source["active"];
	        this.enabled = source["enabled"];
	        this.mods = source["mods"];
	        this.snapshots = source["snapshots"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.lastActivatedAt = source["lastActivatedAt"];
	    }
	}
	export class ProfileComparisonDTO {
	    a: ProfileSummaryDTO;
	    b: ProfileSummaryDTO;
	    onlyA: NamedModDTO[];
	    onlyB: NamedModDTO[];
	    priorityChanged: PriorityDiffDTO[];
	    pluginsOnlyA: string[];
	    pluginsOnlyB: string[];
	    loadOrderChanged: PluginDiffDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ProfileComparisonDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.a = this.convertValues(source["a"], ProfileSummaryDTO);
	        this.b = this.convertValues(source["b"], ProfileSummaryDTO);
	        this.onlyA = this.convertValues(source["onlyA"], NamedModDTO);
	        this.onlyB = this.convertValues(source["onlyB"], NamedModDTO);
	        this.priorityChanged = this.convertValues(source["priorityChanged"], PriorityDiffDTO);
	        this.pluginsOnlyA = source["pluginsOnlyA"];
	        this.pluginsOnlyB = source["pluginsOnlyB"];
	        this.loadOrderChanged = this.convertValues(source["loadOrderChanged"], PluginDiffDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProfileMovesDTO {
	    profileId: string;
	    name: string;
	    moves: ModMoveDTO[];
	
	    static createFrom(source: any = {}) {
	        return new ProfileMovesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profileId = source["profileId"];
	        this.name = source["name"];
	        this.moves = this.convertValues(source["moves"], ModMoveDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class QueueItemDTO {
	    operationId: string;
	    kind: string;
	    label: string;
	    status: string;
	    step?: string;
	    decision?: DecisionDTO;
	    cancellable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QueueItemDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.operationId = source["operationId"];
	        this.kind = source["kind"];
	        this.label = source["label"];
	        this.status = source["status"];
	        this.step = source["step"];
	        this.decision = this.convertValues(source["decision"], DecisionDTO);
	        this.cancellable = source["cancellable"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RecentGameDTO {
	    instance: ManagedGameDTO;
	    lastUsed?: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentGameDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.instance = this.convertValues(source["instance"], ManagedGameDTO);
	        this.lastUsed = source["lastUsed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RemovalPreviewDTO {
	    mods: DuplicateModDTO[];
	    orphanRules: number;
	    sharedArchives: string[];
	    deployed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RemovalPreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mods = this.convertValues(source["mods"], DuplicateModDTO);
	        this.orphanRules = source["orphanRules"];
	        this.sharedArchives = source["sharedArchives"];
	        this.deployed = source["deployed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RestartStateDTO {
	    settings: string[];
	    restore: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RestartStateDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.settings = source["settings"];
	        this.restore = source["restore"];
	    }
	}
	export class RestoreResultDTO {
	    ignored: NamedModDTO[];
	
	    static createFrom(source: any = {}) {
	        return new RestoreResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ignored = this.convertValues(source["ignored"], NamedModDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RootCheckDTO {
	    root: string;
	    version?: string;
	    problem?: ProblemDTO;
	
	    static createFrom(source: any = {}) {
	        return new RootCheckDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.version = source["version"];
	        this.problem = this.convertValues(source["problem"], ProblemDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RuleCycleDTO {
	    mods: ConflictModDTO[];
	    rules: CycleRuleDTO[];
	
	    static createFrom(source: any = {}) {
	        return new RuleCycleDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mods = this.convertValues(source["mods"], ConflictModDTO);
	        this.rules = this.convertValues(source["rules"], CycleRuleDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class RulePreviewDTO {
	    cycle: NamedModDTO[];
	    profiles: ProfileMovesDTO[];
	
	    static createFrom(source: any = {}) {
	        return new RulePreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cycle = this.convertValues(source["cycle"], NamedModDTO);
	        this.profiles = this.convertValues(source["profiles"], ProfileMovesDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SettingDTO {
	    key: string;
	    tab: string;
	    type: string;
	    value: string;
	    default: string;
	    isDefault: boolean;
	    options?: string[];
	    min?: number;
	    max?: number;
	    advanced: boolean;
	    restartRequired: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SettingDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.tab = source["tab"];
	        this.type = source["type"];
	        this.value = source["value"];
	        this.default = source["default"];
	        this.isDefault = source["isDefault"];
	        this.options = source["options"];
	        this.min = source["min"];
	        this.max = source["max"];
	        this.advanced = source["advanced"];
	        this.restartRequired = source["restartRequired"];
	    }
	}
	export class TargetSpecDTO {
	    id: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new TargetSpecDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	    }
	}
	export class SetupDTO {
	    gameId: string;
	    name: string;
	    root: string;
	    store: string;
	    targets: TargetSpecDTO[];
	    executable: string;
	    staging: string;
	    archiveStore: string;
	    backupStore: string;
	    method: string;
	
	    static createFrom(source: any = {}) {
	        return new SetupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.gameId = source["gameId"];
	        this.name = source["name"];
	        this.root = source["root"];
	        this.store = source["store"];
	        this.targets = this.convertValues(source["targets"], TargetSpecDTO);
	        this.executable = source["executable"];
	        this.staging = source["staging"];
	        this.archiveStore = source["archiveStore"];
	        this.backupStore = source["backupStore"];
	        this.method = source["method"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SnapshotDTO {
	    id: string;
	    reason: string;
	    createdAt: string;
	    enabled: number;
	    mods: number;
	
	    static createFrom(source: any = {}) {
	        return new SnapshotDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.reason = source["reason"];
	        this.createdAt = source["createdAt"];
	        this.enabled = source["enabled"];
	        this.mods = source["mods"];
	    }
	}
	export class SortPreviewDTO {
	    moves: PluginMoveDTO[];
	    confirmAbove: number;
	    cycle: string[];
	
	    static createFrom(source: any = {}) {
	        return new SortPreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.moves = this.convertValues(source["moves"], PluginMoveDTO);
	        this.confirmAbove = source["confirmAbove"];
	        this.cycle = source["cycle"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SortResultDTO {
	    moved: number;
	    moves: PluginMoveDTO[];
	
	    static createFrom(source: any = {}) {
	        return new SortResultDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.moved = source["moved"];
	        this.moves = this.convertValues(source["moves"], PluginMoveDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StagingPreviewDTO {
	    from: string;
	    to: string;
	    bytes: number;
	    free: number;
	    deployed: boolean;
	    sameVolume: boolean;
	    hardlinkAfter: boolean;
	    problem?: string;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new StagingPreviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from = source["from"];
	        this.to = source["to"];
	        this.bytes = source["bytes"];
	        this.free = source["free"];
	        this.deployed = source["deployed"];
	        this.sameVolume = source["sameVolume"];
	        this.hardlinkAfter = source["hardlinkAfter"];
	        this.problem = source["problem"];
	        this.reason = source["reason"];
	    }
	}
	
	
	
	export class SuppressionDTO {
	    key?: string;
	    code?: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new SuppressionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.code = source["code"];
	        this.createdAt = source["createdAt"];
	    }
	}
	
	
	export class TempCleanupDTO {
	    removed: number;
	    skipped: number;
	
	    static createFrom(source: any = {}) {
	        return new TempCleanupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.removed = source["removed"];
	        this.skipped = source["skipped"];
	    }
	}
	export class TransferOptionsDTO {
	    order: boolean;
	    plugins: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TransferOptionsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.order = source["order"];
	        this.plugins = source["plugins"];
	    }
	}
	export class UnmanageOptionsDTO {
	    deleteFiles: boolean;
	    confirmName: string;
	
	    static createFrom(source: any = {}) {
	        return new UnmanageOptionsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleteFiles = source["deleteFiles"];
	        this.confirmName = source["confirmName"];
	    }
	}
	export class VerificationDTO {
	    name: string;
	    root: string;
	    version?: string;
	    targets: TargetDTO[];
	    staging: string;
	    archiveStore: string;
	    backupStore: string;
	    methods: MethodStatusDTO[];
	    foreign: FindingDTO[];
	    problems: ProblemDTO[];
	    warnings: ProblemDTO[];
	
	    static createFrom(source: any = {}) {
	        return new VerificationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.root = source["root"];
	        this.version = source["version"];
	        this.targets = this.convertValues(source["targets"], TargetDTO);
	        this.staging = source["staging"];
	        this.archiveStore = source["archiveStore"];
	        this.backupStore = source["backupStore"];
	        this.methods = this.convertValues(source["methods"], MethodStatusDTO);
	        this.foreign = this.convertValues(source["foreign"], FindingDTO);
	        this.problems = this.convertValues(source["problems"], ProblemDTO);
	        this.warnings = this.convertValues(source["warnings"], ProblemDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkaroundsDTO {
	    longPaths: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkaroundsDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.longPaths = source["longPaths"];
	    }
	}
	export class WorkspaceDTO {
	    active?: InstanceRefDTO;
	    instances: InstanceRefDTO[];
	    items: string[];
	
	    static createFrom(source: any = {}) {
	        return new WorkspaceDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = this.convertValues(source["active"], InstanceRefDTO);
	        this.instances = this.convertValues(source["instances"], InstanceRefDTO);
	        this.items = source["items"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

