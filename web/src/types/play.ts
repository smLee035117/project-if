
export type PlayState =
    | 'PLAYING'
    | 'CLEARED'
    | 'FAILED'
    | 'GIVEN_UP'

export interface ScenarioSummary {
    scenarioId: string
    title: string
    version: string
}

export interface PlayAction {
    id: string
    text: string
    available: boolean
}

export interface PlayEnding {
    id: string
    title: string
    description: string
}

export interface ActionHistory {
    sequence: number
    fromSceneId: string
    toSceneId: string
    actionId: string
    actionText: string
    resultText: string
    startedAtMinute: number
    endedAtMinute: number
}

export interface PlayViewV2 {
    scenarioId: string
    scenarioTitle: string
    state: PlayState
    version: number
    currentSceneId: string
    sceneDescription: string
    storyTimeMinutes: number
    knownFacts: string[]
    actions: PlayAction[]
    ending?: PlayEnding
    actionHistory?: ActionHistory[]
}

export interface PlayResponse {
    playId: string
    view: PlayViewV2
}

export interface ActivePlayResponse {
    activePlay: PlayResponse | null
}

export interface ActionResponse {
    resultText: string
    view: PlayViewV2
}
