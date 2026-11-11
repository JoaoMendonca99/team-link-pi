export type Concept = {
    id: string;
    label: string;
    raw?: string;
};
export type Requirement = {
    key: string;
    concept: string | null;
    label: string;
    weight: number;
    source: 'project' | 'vacancy';
};
export type Education = {
    course: string | null;
    institution: string | null;
    current: boolean;
    status: string;
    primary: boolean;
};
export type Person = {
    id: string;
    name: string;
    avatar: string | null;
    skills: Concept[];
    interests: Concept[];
    educations: Education[];
    excluded?: boolean;
};
export type Project = {
    id: string;
    slug: string;
    title: string;
    category: string | null;
    academicCourse?: string | null;
    academicInstitution?: string | null;
    tags: Concept[];
    requirements: Requirement[];
    joined: boolean;
    pending: boolean;
    open: boolean;
};
export type Vacancy = {
    id: string;
    project: string;
    title: string;
    available: number;
    open: boolean;
    requirements: Requirement[];
};
export type Course = {
    id: string;
    label: string;
    cine: string | null;
};
export type Snapshot = {
    actor: string;
    people: Person[];
    projects: Project[];
    vacancies: Vacancy[];
    concepts: Concept[];
    relations: {
        from: string;
        to: string;
        type: 'relacionado_a' | 'mais_especifico_que';
    }[];
    courses: Course[];
    areas: {
        id: string;
        label: string;
        parent: string | null;
    }[];
    institutions: {
        id: string;
        label: string;
    }[];
    offers: {
        course: string;
        institution: string;
    }[];
    members: {
        user: string;
        project: string;
    }[];
    friends: {
        a: string;
        b: string;
    }[];
    excludedFriends: string[];
    sharing: boolean;
    limited: boolean;
};
export type Technical = {
    evidenceCoverage: number;
    percent: number | null;
    exactPercent: number | null;
    total: number;
    identified: {
        label: string;
        kind: 'exact' | 'alias' | 'related';
        weight: number;
        factor: number;
    }[];
    unidentified: string[];
    jaccard: number;
};
export type Recommendation = {
    id: string;
    name: string;
    avatar?: string | null;
    project?: string;
    slug?: string;
    vacancy?: string;
    vacancyTitle?: string;
    available?: number;
    technical?: Technical;
    score: number;
    coverage: number;
    reasons: string[];
    tags: string[];
    academic: string[];
    path: string[];
};
export type RecommendationResult = {
    vacancies?: {
        id: string;
        title: string;
    }[];
    items: Recommendation[];
    limited: boolean;
    sharing: boolean;
    context: {
        vertices: number;
        edges: number;
    };
    notice: string;
};
