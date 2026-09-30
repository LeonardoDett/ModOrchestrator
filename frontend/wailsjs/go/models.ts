export namespace bridge {
	
	export class AppInfo {
	    name: string;
	    version: string;
	    dataDir: string;
	    schemaVersion: number;
	    interruptedOperations: number;
	
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
	

}

