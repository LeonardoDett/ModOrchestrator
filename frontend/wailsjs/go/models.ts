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

}

