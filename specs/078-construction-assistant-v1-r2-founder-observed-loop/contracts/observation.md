# Founder observation contract

The local form must:

1. display the synthetic-data boundary and exact eight actions;
2. start timing only after Olivier selects `Commencer le test`;
3. never prefill subjective ratings;
4. require every action acknowledgement and rating;
5. submit once to localhost only;
6. write one closed JSON packet under feature evidence;
7. refuse overwrite, replay, unknown fields and non-Olivier participant identity;
8. seal canonical JSON with SHA-256.

The test server must bind only to loopback and provide no proxy or external fetch capability.
