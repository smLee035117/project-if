interface ScenarioRegistrationV2 {
    fileName: string;
    published: boolean;
}

export const scenarioRegistry: Record<string, ScenarioRegistrationV2> = {
    apartment_fire_01: {
        fileName: 'apartment_fire_01.json',
        published: false,
    },
    blackout_resource_01: {
        fileName: 'blackout_resource_01.json',
        published: false,
    },
    lost_hiking_01: {
        fileName: 'lost_hiking_01.json',
        published: false,
    },
    basement_flood_01: {
        fileName: 'basement_flood_01.json',
        published: false,
    },
    office_fire_01: {
        fileName: 'office_fire_01.json',
        published: true,
    },
};


export function isScenarioPublishedV2(
    scenarioId: string,
): boolean {

    const isRegistered = Object.hasOwn(scenarioRegistry, scenarioId);

    if (isRegistered) {
        return scenarioRegistry[scenarioId]?.published ?? false;
    }

    return false;

}