def chunk_resource(entry):
    resource = entry.get('resource')
    if resource.get('resourceType') == "Encounter":
        print(f"class {resource.get('class')}")
        print(f"type: {resource.get('type')}")
        print(f"participant: {resource.get('participant')}")
    elif resource.get('resourceType') == "DocumentReference":
        print("we have a document reference, possible strategy is to convert pdf to text and use langchain to make embeddings")
    elif resource.get('resourceType') == "MedicationStatement":
        print(f"medication codeable concept {resource.get('medicationCodeableConcept')}")
        print(f"dosage {resource.get('dosage')}")
    elif resource.get('resourceType') == "AllergyIntolerance":
        print(f"this patient is allergic to {resource.get('code')}")
        print(f"this patient has a reaction: {resource.get('reaction')}")
    elif resource.get('resourceType') == "Condition":
        print(f"the patient has this condition: {resource.get('code')}")


# pdf plumber

def parse_patient_information(patient_info):
    for info in patient_info:
        # print(info['resourceType'])
        if info['resourceType'] == "Bundle":
            entries = info.get('entry')
            # print(f"this is a our entry {entry}")
            if not entries:
                continue
            for entry in entries:
                chunk_resource(entry)
        else:
            print(info['resourceType'])
        
        print("------------------------")
