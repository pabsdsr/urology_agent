def extract_appointment_data(bundle):
    appointments = []
    # Build lookup tables for included resources
    patient_names = {}
    practitioner_names = {}
    location_names = {}
    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") == "Patient":
            patient_names[resource.get("id")] = resource.get("name", [{}])[0].get("text") or resource.get("name", [{}])[0].get("family")
        elif resource.get("resourceType") == "Practitioner":
            practitioner_names[resource.get("id")] = resource.get("name", [{}])[0].get("text") or resource.get("name", [{}])[0].get("family")
        elif resource.get("resourceType") == "Location":
            location_names[resource.get("id")] = resource.get("name")

    for entry in bundle.get("entry", []):
        resource = entry.get("resource", {})
        if resource.get("resourceType") == "Appointment":
            appointment = {
                "id": resource.get("id"),
                "start": resource.get("start"),
                "end": resource.get("end"),
                "status": resource.get("status"),
                "type": resource.get("appointmentType", {}).get("text"),
                "patient_id": None,
                "patient_name": None,
                "practitioner_ids": [],
                "practitioner_names": [],
                "location_ids": [],
                "location_names": [],
            }
            for participant in resource.get("participant", []):
                actor = participant.get("actor", {})
                reference = actor.get("reference", "")
                if reference.startswith("Patient/"):
                    pid = reference.split("/")[-1]
                    appointment["patient_id"] = pid
                    appointment["patient_name"] = patient_names.get(pid)
                elif reference.startswith("Practitioner/"):
                    prid = reference.split("/")[-1]
                    appointment["practitioner_ids"].append(prid)
                    appointment["practitioner_names"].append(practitioner_names.get(prid))
                elif reference.startswith("Location/"):
                    lid = reference.split("/")[-1]
                    appointment["location_ids"].append(lid)
                    appointment["location_names"].append(location_names.get(lid))
            appointments.append(appointment)
    return appointments
