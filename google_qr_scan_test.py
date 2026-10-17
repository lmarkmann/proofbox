from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/scan', methods=['POST'])
def receive_scan():
    data = request.json
    scanned_type = data.get('type', 'Unknown')
    scanned_content = data.get('content', '')
    
    print(f"\n🚀 [RECEIVED] Type: {scanned_type} | Content: {scanned_content}")
    
    # You can add logic here to type it into your laptop screen, 
    # save it to a file, or push it to a database.
    return jsonify({"status": "success"}), 200

if __name__ == '__main__':
    # Runs the server on port 5000 and opens it up to your local network
    app.run(host='0.0.0.0', port=5000)

