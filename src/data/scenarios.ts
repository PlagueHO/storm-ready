import type { Scenario } from '../types';

/**
 * Built-in storm scenarios.
 *
 * This is intentionally plain, static data with no backend dependency so the
 * app runs entirely locally. New scenarios can be added here to extend the game.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'flood-2026',
    type: 'flood',
    name: 'Flash Flood Warning',
    tagline: 'Rising water is cutting off the neighbourhood. Race to high ground.',
    emoji: '🌊',
    durationSeconds: 45,
    tasks: [
      {
        id: 'flood-kit',
        label: 'Grab the emergency go-bag',
        description: 'Take water, first-aid supplies, a torch and a charged power bank.',
        category: 'supplies',
        points: 20,
      },
      {
        id: 'flood-valuables',
        label: 'Move valuables upstairs',
        description: 'Lift electronics, documents and keepsakes off the floor.',
        category: 'home',
        points: 15,
      },
      {
        id: 'flood-power',
        label: 'Switch off power at the mains',
        description: 'Avoid electrical hazards if water enters the home.',
        category: 'home',
        points: 15,
      },
      {
        id: 'flood-drains',
        label: 'Clear gutters and drains',
        description: 'Help water flow away instead of pooling around the house.',
        category: 'outdoor',
        points: 10,
      },
      {
        id: 'flood-sandbags',
        label: 'Place sandbags at doorways',
        description: 'Divert water away from entry points and low vents.',
        category: 'outdoor',
        points: 20,
      },
      {
        id: 'flood-plan',
        label: 'Choose a safe evacuation route',
        description: 'Stay out of floodwater and move inland or to higher ground.',
        category: 'people',
        points: 20,
      },
    ],
  },
  {
    id: 'cyclone-2026',
    type: 'cyclone',
    name: 'Cyclone Incoming',
    tagline: 'Damaging winds approaching. Secure everything that can fly.',
    emoji: '🌀',
    durationSeconds: 40,
    tasks: [
      {
        id: 'cyclone-furniture',
        label: 'Secure outdoor furniture',
        description: 'Bring in or tie down anything the wind could lift.',
        category: 'outdoor',
        points: 20,
      },
      {
        id: 'cyclone-windows',
        label: 'Tape and shutter windows',
        description: 'Reduce the risk of shattering glass from flying debris.',
        category: 'home',
        points: 20,
      },
      {
        id: 'cyclone-trees',
        label: 'Trim overhanging branches',
        description: 'Remove limbs that could fall on the roof or lines.',
        category: 'outdoor',
        points: 15,
      },
      {
        id: 'cyclone-devices',
        label: 'Charge phones and power banks',
        description: 'Stay reachable if the power goes out.',
        category: 'supplies',
        points: 15,
      },
      {
        id: 'cyclone-water',
        label: 'Store drinking water',
        description: 'Fill containers in case supply is disrupted.',
        category: 'supplies',
        points: 15,
      },
      {
        id: 'cyclone-checkin',
        label: 'Check on neighbours',
        description: 'Make sure vulnerable people nearby have a plan too.',
        category: 'people',
        points: 15,
      },
    ],
  },
  {
    id: 'hail-2026',
    type: 'hail',
    name: 'Supercell Hailstorm',
    tagline: 'Golf-ball hail forecast. Shield your car and roof.',
    emoji: '🧊',
    durationSeconds: 35,
    tasks: [
      {
        id: 'hail-car',
        label: 'Park the car under cover',
        description: 'A garage or carport prevents costly dents and glass damage.',
        category: 'outdoor',
        points: 25,
      },
      {
        id: 'hail-skylights',
        label: 'Cover skylights and glass',
        description: 'Protect vulnerable roof glazing from impact.',
        category: 'home',
        points: 20,
      },
      {
        id: 'hail-pets',
        label: 'Bring pets indoors',
        description: 'Keep animals safe and calm away from the storm.',
        category: 'people',
        points: 15,
      },
      {
        id: 'hail-garden',
        label: 'Shelter the garden and plants',
        description: 'Move pots and cover beds to limit damage.',
        category: 'outdoor',
        points: 10,
      },
      {
        id: 'hail-photos',
        label: 'Photograph your property',
        description: 'A quick before-record makes any future claim easier.',
        category: 'supplies',
        points: 15,
      },
      {
        id: 'hail-indoors',
        label: 'Stay away from windows',
        description: 'Move everyone to an interior room during the peak.',
        category: 'people',
        points: 15,
      },
    ],
  },
  {
    id: 'heatwave-2026',
    type: 'heatwave',
    name: 'Extreme Heatwave',
    tagline: 'Record temperatures ahead. Keep cool and keep safe.',
    emoji: '🔥',
    durationSeconds: 50,
    tasks: [
      {
        id: 'heat-blinds',
        label: 'Close blinds on the sunny side',
        description: 'Block direct sun to keep indoor temperatures down.',
        category: 'home',
        points: 15,
      },
      {
        id: 'heat-hydrate',
        label: 'Stock plenty of water',
        description: 'Hydration is the simplest defence against heat stress.',
        category: 'supplies',
        points: 20,
      },
      {
        id: 'heat-checkin',
        label: 'Check on elderly relatives',
        description: 'Older people are most at risk in extreme heat.',
        category: 'people',
        points: 20,
      },
      {
        id: 'heat-pets',
        label: 'Give pets shade and water',
        description: 'Never leave animals in hot cars or unshaded yards.',
        category: 'people',
        points: 15,
      },
      {
        id: 'heat-cooling',
        label: 'Plan a cool space',
        description: 'Identify an air-conditioned room or public place to retreat to.',
        category: 'home',
        points: 15,
      },
      {
        id: 'heat-fire',
        label: 'Clear flammable debris',
        description: 'Reduce fire risk by clearing dry leaves near the house.',
        category: 'outdoor',
        points: 15,
      },
    ],
  },
];

/** Look up a scenario by id. Returns undefined when the id is unknown. */
export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
