import { Injectable } from '@angular/core';
import { RestResourceEndpoint } from './models/rest-resource-endpoint.model';

import { RestResourceContext } from './models/rest-resource-context.model';
import { RestResourceEnvironment } from './models/rest-resource-environment.model';
import { RestResourceConfig } from './models';
import { RestServiceOptions } from '../rest-service-options.model';
import { RestIdentifierScheme } from './enums/rest-identifier-scheme.enum';

@Injectable({
  providedIn: 'root',
})
export class ResourceUrlService {
  private readonly resourceConfig: RestResourceConfig;
  private readonly runningEnvironment: string;
  private endpointConfigs: RestResourceEndpoint[] = [];

  constructor(restServiceOptions: RestServiceOptions) {
    this.resourceConfig = restServiceOptions.restResourceConfig || new RestResourceConfig();
    this.runningEnvironment = restServiceOptions.resourceEnvironment || '';
    this.loadConfig();
  }

  public getEndpoint(resource: string): RestResourceEndpoint {
    const endpointConfig = this.endpointConfigs.find((e: RestResourceEndpoint) => e.resource === resource);

    if (!endpointConfig) {
      throw new Error(`Endpoint not configured for Resource ${resource}`);
    }

    return endpointConfig;
  }

  private loadConfig(): void {
    const configLoadErrors: string[] = [];

    if (this.resourceConfig === null) {
      configLoadErrors.push('No configuration found for the REST Resource Service');
    }

    const runningEnvironment: RestResourceEnvironment | undefined = this.resourceConfig.environments.find(
      (x) => x.name === this.runningEnvironment
    );

    if (!runningEnvironment) {
      throw new Error(`Environment is undefined for ${this.resourceConfig.resourceEnvironment}`);
    }

    if (!runningEnvironment?.domain) {
      configLoadErrors.push(`Environment must have a domain in Environment ${this.resourceConfig.resourceEnvironment}`);
    }

    // Validate the endpoints configuration.
    this.endpointConfigs.forEach((endpoint: RestResourceEndpoint) => {
      if (endpoint.resource === null) {
        configLoadErrors.push(`Configuration does not declare the resource`);
      }

      if (endpoint.url === null) {
        configLoadErrors.push(`Endpoints must specify the URL. Endpoint definition invalid for resource ${endpoint.resource}`);
      }

      if (endpoint.url.includes('://') || endpoint.url.includes('.')) {
        configLoadErrors.push(`Endpoint URL should not include the domain for Resource ${endpoint.resource}`);
      }

      if (endpoint.versions === null && runningEnvironment.versions === null) {
        configLoadErrors.push(`Endpoints must specify version explicitly if not defined in environment. Endpoint definition invalid for resource ${endpoint.resource}`);
      }
    });

    if (configLoadErrors.length > 0) {
      throw new Error(`Resource Config Loading Exception \n ${configLoadErrors.toString().replace(',', '\n')}`);
    }

    const environmentDomainUrl = runningEnvironment.domain;

    // Load the general endpoint section.
    this.resourceConfig.contexts.map((context: RestResourceContext) => {
      context.endpoints.forEach((endpoint: RestResourceEndpoint) => {
        if (environmentDomainUrl === null && context.domain === null) {
          configLoadErrors.push(`Error loading general endpoints. Context must have a baseUrl for Context ${context.name}`);
        }

        const endpointUrl = `${context.domain || environmentDomainUrl}/${endpoint.url}`
        const versioningScheme = endpoint.versioningScheme || context.versioningScheme || runningEnvironment.versioningScheme;

        // TODO: Need to account for versioning for each individual endpoint.
        this.endpointConfigs.push({
          identifierScheme: endpoint.identifierScheme || RestIdentifierScheme.Array,
          resource: endpoint.resource,
          url: endpointUrl,
          versioningScheme: versioningScheme
        });
      });
    });

    // Overwrite or add any environment specific endpoints.
    runningEnvironment.contexts.map((context: RestResourceContext) => {
      context.endpoints.forEach((endpoint: RestResourceEndpoint) => {
        const existing = this.endpointConfigs.findIndex(x => x.resource === endpoint.resource);
        if (existing) {
          this.endpointConfigs.splice(existing, 1);
        }

        const endpointUrl = `${context.domain || environmentDomainUrl}/${endpoint.url}`
        this.endpointConfigs.push({
          identifierScheme: endpoint.identifierScheme,
          resource: endpoint.resource,
          url: endpointUrl,
          versioningScheme: endpoint.versioningScheme || context.versioningScheme || runningEnvironment.versioningScheme
        });
      })
    });
  }
}
