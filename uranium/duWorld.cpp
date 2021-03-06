#include "duWorld.h"

duWorld::duWorld(btDispatcher* dispatcher, 
        btBroadphaseInterface* pairCache, btConstraintSolver* constraintSolver,
        btCollisionConfiguration* collisionConfiguration) :
btDiscreteDynamicsWorld(dispatcher, pairCache, constraintSolver, 
        collisionConfiguration)
{

}

duWorld::~duWorld()
{

}

int	duWorld::preSimulation(btScalar timeStep, int maxSubSteps,
        btScalar fixedTimeStep)
{
    int numSimulationSubSteps = 0;

    // no variable timestep
    btAssert(maxSubSteps);

    m_fixedTimeStep = fixedTimeStep;
    m_localTime += timeStep;
    if (m_localTime >= fixedTimeStep) {
        numSimulationSubSteps = int(m_localTime / fixedTimeStep);
        m_localTime -= numSimulationSubSteps * fixedTimeStep;
    }

    if (numSimulationSubSteps) {
        // clamp the number of substeps, to prevent simulation grinding spiralling down to a halt
        int clampedSimulationSteps = (numSimulationSubSteps > maxSubSteps) ? 
        maxSubSteps : numSimulationSubSteps;

        saveKinematicState(fixedTimeStep * clampedSimulationSteps);

        applyGravity();

        return clampedSimulationSteps;
    } else {
        synchronizeMotionStates();
        return 0;
    }
}

btScalar duWorld::calcSimTime(btScalar timeline, int step, int clampedSimulationSteps)
{
    btScalar simTime = timeline - m_localTime -
            (clampedSimulationSteps - 1 - step) * m_fixedTimeStep;

    return simTime;
}

void duWorld::singleStepSimulation(btScalar simTime)
{
    internalSingleStepSimulation(m_fixedTimeStep);

    // NOTE: originally this was after post-simulation callback
    synchronizeMotionStates();
}


void duWorld::postSimulation()
{
	clearForces();
}

/* vim: set et ts=4 sw=4: */
