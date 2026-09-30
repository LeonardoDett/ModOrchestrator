export namespace bridge {
	
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
	export class ErrorDTO {
	    code: string;
	    message: string;
	    step?: string;
	    detail?: string;
	    retryable: boolean;
	
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
	export class FoldersDTO {
	    staging: string;
	    archiveStore: string;
	    backupStore: string;
	
	    static createFrom(source: any = {}) {
	        return new FoldersDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.staging = source["staging"];
	        this.archiveStore = source["archiveStore"];
	        this.backupStore = source["backupStore"];
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

